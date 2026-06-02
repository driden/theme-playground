import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { discoverSlots, paletteKeysFromStarshipToml } from "./src/lib/slot-discovery";
import {
  THEMES_DIR, listThemes, themeExists, readPalette,
} from "./src/lib/themes";
import {
  isAppName, errMessage, SlotEditBodySchema,
  type AppName, type AppState, type ColorSlot, type ThemeState,
} from "./src/lib/types";

const REPO_ROOT = path.resolve(THEMES_DIR, "..");
const DRAFTS_DIR = path.join(import.meta.dir, ".drafts");

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

// Match a path against a regex and return its capture groups as a non-null
// tuple. Returns null on no-match so callers can branch on null instead of
// destructuring with non-null assertions everywhere.
function matchRoute(pathname: string, re: RegExp): string[] | null {
  const m = pathname.match(re);
  if (!m) return null;
  return m.slice(1) as string[];
}

// ── path / draft helpers ─────────────────────────────────────────────────────

function originalPath(theme: string, app: AppName): string {
  return path.join(THEMES_DIR, theme, `${app}.toml`);
}
function draftPath(theme: string, app: AppName): string {
  return path.join(DRAFTS_DIR, `${theme}-${app}.toml`);
}

// First touch: copy original → draft. Idempotent on subsequent calls.
async function ensureDraft(theme: string, app: AppName): Promise<string> {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  const draft = draftPath(theme, app);
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

// ── undo stack (in-memory, per theme+app) ────────────────────────────────────

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

// ── request-validation helpers ───────────────────────────────────────────────

async function assertThemeExists(themeName: string): Promise<void> {
  if (!(await themeExists(themeName))) throw new HttpError(404, "unknown theme");
}

function assertAppName(app: string): asserts app is AppName {
  if (!isAppName(app)) throw new HttpError(404, `app '${app}' not supported`);
}

// ── starship subprocess ──────────────────────────────────────────────────────

async function renderStarship(configPath: string): Promise<{ ansi: string | null; error: string | null }> {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? os.homedir(),
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "xterm-256color",
    STARSHIP_CONFIG: configPath,
    // Intentionally no STARSHIP_SHELL — setting it to zsh makes starship
    // wrap ANSI escapes in `%{...%}` markers for zsh's prompt-length counter,
    // which real zsh strips but our HTML preview shows literally.
  };
  try {
    const proc = Bun.spawn(
      ["starship", "prompt",
       "--terminal-width=120",
       "--status=0",
       "--cmd-duration=1234",
       "--jobs=0"],
      { cwd: REPO_ROOT, env, stdout: "pipe", stderr: "pipe" },
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

// ── theme state ──────────────────────────────────────────────────────────────

async function buildAppState(themeName: string): Promise<AppState> {
  const draft = await ensureDraft(themeName, "starship");
  const fileRaw = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(fileRaw);
  let colorSlots: ColorSlot[] = [];
  let slotError: string | null = null;
  try {
    colorSlots = discoverSlots(fileRaw, palette, "name-token");
  } catch (e: unknown) {
    console.error(e);
    slotError = errMessage(e);
  }
  const { ansi, error: previewError } = await renderStarship(draft);
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
  return {
    name: themeName,
    palette: await readPalette(themeName),
    apps: [await buildAppState(themeName)],
  };
}

// ── http ─────────────────────────────────────────────────────────────────────

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const server = Bun.serve({
  port: 5174,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    try {
      if (req.method === "GET" && pathname === "/api/themes") {
        return json(await listThemes());
      }

      const themeCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)$/);
      if (req.method === "GET" && themeCaps) {
        const [themeName] = themeCaps as [string];
        await assertThemeExists(themeName);
        return json(await buildThemeState(themeName));
      }

      // POST /api/themes/:name/:app/(undo|save|discard) — draft actions
      const actionCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)\/([\w-]+)\/(undo|save|discard)$/);
      if (req.method === "POST" && actionCaps) {
        const [themeName, app, action] = actionCaps as [string, string, "undo" | "save" | "discard"];
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
        } else if (action === "discard") {
          const originalText = await fs.readFile(original, "utf8");
          await fs.writeFile(draft, originalText, "utf8");
          clearHistory(themeName, app);
        }
        return json(await buildAppState(themeName));
      }

      // POST /api/themes/:name/:app — slot edit (writes to draft)
      const editCaps = matchRoute(pathname, /^\/api\/themes\/([\w-]+)\/([\w-]+)$/);
      if (req.method === "POST" && editCaps) {
        const [themeName, app] = editCaps as [string, string];
        await assertThemeExists(themeName);
        assertAppName(app);

        const parsed = SlotEditBodySchema.safeParse(await req.json());
        if (!parsed.success) throw new HttpError(400, "invalid body: " + parsed.error.message);
        const { slotId, newPaletteKey } = parsed.data;

        const draft = await ensureDraft(themeName, app);
        const current = await fs.readFile(draft, "utf8");
        const palette = paletteKeysFromStarshipToml(current);
        if (!palette.has(newPaletteKey.toLowerCase())) {
          throw new HttpError(400, `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`);
        }
        const slots = discoverSlots(current, palette, "name-token");
        const slot = slots.find(s => s.id === slotId);
        if (!slot) throw new HttpError(409, `slot '${slotId}' not found in current file (file may have changed)`);

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
  },
});

console.log(`theme-playground server listening on http://localhost:${server.port}`);
