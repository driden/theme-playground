import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { discoverSlots, paletteKeysFromStarshipToml } from "./src/lib/slot-discovery";
import { THEMES_DIR, listThemes, themeExists, readPalette, readSections } from "./src/lib/themes";
import { resolveSection } from "./src/lib/sections";
import { parseFormatTokens } from "./src/lib/format-tokens";
import {
  isAppName,
  errMessage,
  SlotEditBodySchema,
  SectionEditBodySchema,
  type AppName,
  type AppState,
  type ColorSlot,
  type ThemeState,
} from "./src/lib/types";

class HttpError extends Error {
  constructor(
    public status: number,
    msg: string,
  ) {
    super(msg);
  }
}

// Recursively builds a fixed-length tuple of `string`, used to type
// matchRoute's return so call sites can destructure without a cast.
type StringTuple<N extends number, Acc extends string[] = []> = Acc["length"] extends N
  ? Acc
  : StringTuple<N, [...Acc, string]>;

// Match a path against a regex with a known number of mandatory capture
// groups. Returns a typed tuple of `arity` strings on match, null otherwise.
function matchRoute<N extends number>(
  pathname: string,
  re: RegExp,
  arity: N,
): StringTuple<N> | null {
  const match = pathname.match(re);
  if (!match) return null;
  const caps = match.slice(1);
  if (caps.length !== arity) return null;
  // Sound: we just validated `caps.length === arity`, and regex capture groups
  // without `?` always return string when the whole match succeeds.
  return caps as StringTuple<N>;
}

const APP_CONFIG_FILE: Record<AppName, string> = {
  starship: "starship.toml",
};

function originalPath(theme: string, app: AppName): string {
  return path.join(THEMES_DIR, theme, APP_CONFIG_FILE[app]);
}

function getDraftDir(theme: string, app: AppName): string {
  return path.join(THEMES_DIR, theme, ".drafts", app);
}

function draftPath(theme: string, app: AppName): string {
  return path.join(getDraftDir(theme, app), APP_CONFIG_FILE[app]);
}

// First touch: copy original → draft. Idempotent on subsequent calls.
async function ensureDraft(theme: string, app: AppName): Promise<string> {
  const draft = draftPath(theme, app);
  await fs.mkdir(getDraftDir(theme, app), { recursive: true });
  if (!(await Bun.file(draft).exists())) {
    const original = await fs.readFile(originalPath(theme, app), "utf8");
    await fs.writeFile(draft, original);
  }
  return draft;
}

async function isDirty(theme: string, app: AppName): Promise<boolean> {
  const draftText = await fs.readFile(draftPath(theme, app), "utf8");
  const originalText = await fs.readFile(originalPath(theme, app), "utf8");
  return draftText !== originalText;
}

const HISTORY_LIMIT = 50;
const histories = new Map<string, string[]>();
const histKey = (theme: string, app: AppName) => `${theme}/${app}`;

function pushHistory(theme: string, app: AppName, snapshot: string) {
  const key = histKey(theme, app);
  const stack = histories.get(key) ?? [];
  stack.push(snapshot);
  if (stack.length > HISTORY_LIMIT) stack.shift();
  histories.set(key, stack);
}
function popHistory(theme: string, app: AppName): string | null {
  return histories.get(histKey(theme, app))?.pop() ?? null;
}
function canUndo(theme: string, app: AppName): boolean {
  return (histories.get(histKey(theme, app)) ?? []).length > 0;
}
function clearHistory(theme: string, app: AppName) {
  histories.delete(histKey(theme, app));
}

async function assertThemeExists(themeName: string): Promise<void> {
  if (!(await themeExists(themeName))) throw new HttpError(404, "unknown theme");
}

function assertAppName(app: string): asserts app is AppName {
  if (!isAppName(app)) throw new HttpError(404, `app '${app}' not supported`);
}

async function renderStarship(
  theme: string,
): Promise<{ ansi: string | null; error: string | null }> {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "xterm-256color",
    STARSHIP_CONFIG: draftPath(theme, "starship"),
  };
  try {
    const proc = Bun.spawn(
      [
        "starship",
        "prompt",
        "--terminal-width=120",
        "--status=0",
        "--cmd-duration=1234",
        "--jobs=0",
      ],
      { cwd: path.join(THEMES_DIR, theme), env, stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exit = await proc.exited;
    if (exit !== 0) return { ansi: null, error: stderr.trim() || `starship exited ${exit}` };
    return { ansi: stdout, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { ansi: null, error: "starship binary not found in PATH" };
  }
}

function tryDiscoverSlots(
  fileRaw: string,
  palette: Set<string>,
): { colorSlots: ColorSlot[]; slotError: string | null } {
  try {
    return { colorSlots: discoverSlots(fileRaw, palette, "name-token"), slotError: null };
  } catch (e: unknown) {
    console.error(e);
    return { colorSlots: [], slotError: errMessage(e) };
  }
}

async function buildAppState(themeName: string): Promise<AppState> {
  const draft = await ensureDraft(themeName, "starship");
  const fileRaw = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(fileRaw);
  const { colorSlots, slotError } = tryDiscoverSlots(fileRaw, palette);
  const { ansi, error: previewError } = await renderStarship(themeName);
  return {
    app: "starship",
    fileRaw,
    colorSlots,
    preview: ansi !== null ? { kind: "ansi", data: ansi } : null,
    previewError,
    slotError,
    dirty: await isDirty(themeName, "starship"),
    canUndo: canUndo(themeName, "starship"),
  };
}

async function buildThemeState(themeName: string): Promise<ThemeState> {
  const [palette, sections] = await Promise.all([
    readPalette(themeName),
    readSections(themeName, "starship"),
  ]);
  return {
    name: themeName,
    palette,
    apps: [await buildAppState(themeName)],
    ...(sections !== null ? { sections } : {}),
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  try {
    if (req.method === "GET" && pathname === "/api/themes") {
      return json(await listThemes());
    }

    const themeCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)$/, 1);
    if (req.method === "GET" && themeCaps) {
      const [themeName] = themeCaps;
      await assertThemeExists(themeName);
      return json(await buildThemeState(themeName));
    }

    // POST /api/themes/:name/:app/(undo|save|discard) — draft actions
    const actionCaps = matchRoute(
      pathname,
      /^\/api\/themes\/([\w-]+)\/([\w-]+)\/(undo|save|discard)$/,
      3,
    );
    if (req.method === "POST" && actionCaps) {
      const [themeName, app, action] = actionCaps;
      await assertThemeExists(themeName);
      assertAppName(app);
      const draft = draftPath(themeName, app);
      const original = originalPath(themeName, app);

      if (action === "undo") {
        const prev = popHistory(themeName, app);
        if (prev === null) throw new HttpError(400, "nothing to undo");
        await fs.writeFile(draft, prev, "utf8");
      } else if (action === "save") {
        await ensureDraft(themeName, app);
        const draftText = await fs.readFile(draft, "utf8");
        await fs.writeFile(original, draftText, "utf8");
        clearHistory(themeName, app);
      } else if (action === "discard") {
        const originalText = await fs.readFile(original, "utf8");
        await fs.writeFile(draft, originalText, "utf8");
        clearHistory(themeName, app);
      }
      return json(await buildAppState(themeName));
    }

    // TODO: extract this matchRoute/if-chain dispatch into a dedicated router
    // module so the handler isn't one long sequence of regex matches.
    // POST /api/themes/:name/:app/section — atomic section-level edit
    const sectionCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)\/([\w-]+)\/section$/, 2);
    if (req.method === "POST" && sectionCaps) {
      const [themeName, app] = sectionCaps;
      await assertThemeExists(themeName);
      assertAppName(app);

      const parsed = SectionEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);
      const { sectionName, newPaletteKey } = parsed.data;

      const sections = await readSections(themeName, app);
      if (!sections) throw new HttpError(400, "this theme has no starship.sections.json");

      const draft = await ensureDraft(themeName, app);
      const current = await fs.readFile(draft, "utf8");
      const palette = paletteKeysFromStarshipToml(current);
      if (!palette.has(newPaletteKey.toLowerCase())) {
        throw new HttpError(
          400,
          `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`,
        );
      }

      const colorSlots = discoverSlots(current, palette, "name-token");
      const formatTokens = parseFormatTokens(current);
      const targetSlots = resolveSection(sectionName, sections, colorSlots, formatTokens);
      if (targetSlots.length === 0) {
        throw new HttpError(404, `section '${sectionName}' not found or has no editable slots`);
      }

      pushHistory(themeName, app, current);
      // Apply right-to-left so earlier byte offsets remain valid after each splice.
      const sorted = [...targetSlots].sort((a, b) => b.start - a.start);
      const next = sorted.reduce(
        (acc, slot) => acc.slice(0, slot.start) + newPaletteKey + acc.slice(slot.end),
        current,
      );
      await fs.writeFile(draft, next, "utf8");
      return json(await buildAppState(themeName));
    }

    // POST /api/themes/:name/:app — slot edit (writes to draft)
    const editCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)\/([\w-]+)$/, 2);
    if (req.method === "POST" && editCaps) {
      const [themeName, app] = editCaps;
      await assertThemeExists(themeName);
      assertAppName(app);

      const parsed = SlotEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);
      const { slotId, newPaletteKey } = parsed.data;

      const draft = await ensureDraft(themeName, app);
      const current = await fs.readFile(draft, "utf8");
      const palette = paletteKeysFromStarshipToml(current);
      if (!palette.has(newPaletteKey.toLowerCase())) {
        throw new HttpError(
          400,
          `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`,
        );
      }
      const slots = discoverSlots(current, palette, "name-token");
      const slot = slots.find(s => s.id === slotId);
      if (!slot)
        throw new HttpError(
          409,
          `slot '${slotId}' not found in current file (file may have changed)`,
        );

      pushHistory(themeName, app, current);
      const next = current.slice(0, slot.start) + newPaletteKey + current.slice(slot.end);
      await fs.writeFile(draft, next, "utf8");
      return json(await buildAppState(themeName));
    }

    return json({ error: "not found" }, 404);
  } catch (e: unknown) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "internal server error" }, 500);
  }
}

if (import.meta.main) {
  const server = Bun.serve({ port: 5174, fetch: handleRequest });
  console.log(`theme-playground server listening on http://localhost:${server.port}`);
}
