import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { discoverSlots, paletteKeysFromStarshipToml } from "./slot-discovery";
import { listThemes, themeExists, readPalette, readSections } from "@playground/lib/themes";
import { resolveSection } from "@playground/lib/sections";
import { parseFormatTokens } from "@playground/lib/format-tokens";
import {
  isAppName,
  errMessage,
  SlotEditBodySchema,
  SectionEditBodySchema,
  type AppName,
  type AppState,
  type ColorSlot,
  type ThemeState,
  type SlotEditBody,
} from "@playground/lib/types";
import { config } from "@playground/lib/config";
import type { Serve } from "bun";
import { HttpError } from "./http.error";

const APP_CONFIG_FILE: Record<AppName, string> = {
  starship: "starship.toml",
};

function originalPath(theme: string, app: AppName): string {
  return path.join(config().themesDir, theme, APP_CONFIG_FILE[app]);
}

function getDraftDir(theme: string, app: AppName): string {
  return path.join(config().themesDir, theme, ".drafts", app);
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
      { cwd: path.join(config().themesDir, theme), env, stdout: "pipe", stderr: "pipe" },
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

export const routes: Serve.Routes<undefined, string> = {
  "/api/themes": async () => json(await listThemes()),
  "/api/themes/:theme": async req => json(await handleGetTheme(req.params.theme as string)),
  "/api/themes/:theme/:app/:action": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;
      const action = req.params.action as string;
      return json(await handleAction(theme, app, action));
    },
  },
  "/api/themes/:theme/:app": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;

      await assertThemeExists(theme);
      assertAppName(app);

      const parsed = SlotEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);

      const result = await handleSlotEdit(theme, app, parsed.data);

      if (isPaletteError(result)) {
        return json({ error: result.cause }, result.user ? 400 : 409);
      }

      return json(result);
    },
  },
  "/api/themes/:theme/:app/section": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;

      await assertThemeExists(theme);
      assertAppName(app);

      const parsed = SectionEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);
      const { sectionName, newPaletteKey } = parsed.data;

      const sections = await readSections(theme, app);
      if (!sections) throw new HttpError(400, "this theme has no starship.sections.json");

      const draft = await ensureDraft(theme, app);
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

      pushHistory(theme, app, current);
      // Apply right-to-left so earlier byte offsets remain valid after each splice.
      const sorted = [...targetSlots].sort((a, b) => b.start - a.start);
      const next = sorted.reduce(
        (acc, slot) => acc.slice(0, slot.start) + newPaletteKey + acc.slice(slot.end),
        current,
      );
      await fs.writeFile(draft, next, "utf8");
      return json(await buildAppState(theme));
    },
  },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleUndo(themeName: string, app: AppName, draft: string) {
  const prev = popHistory(themeName, app);
  if (prev === null) throw new HttpError(400, "nothing to undo");
  await fs.writeFile(draft, prev, "utf8");
}

export async function handleSave(themeName: string, app: AppName, draft: string, original: string) {
  await ensureDraft(themeName, app);
  const draftText = await fs.readFile(draft, "utf8");
  await fs.writeFile(original, draftText, "utf8");
  clearHistory(themeName, app);
}

export async function handleDiscard(
  themeName: string,
  app: AppName,
  draft: string,
  original: string,
) {
  const originalText = await fs.readFile(original, "utf8");
  await fs.writeFile(draft, originalText, "utf8");
  clearHistory(themeName, app);
}

export async function handleGetTheme(themeName: string) {
  await assertThemeExists(themeName);
  return buildThemeState(themeName);
}

export async function handleAction(themeName: string, app: string, action: string) {
  await assertThemeExists(themeName);
  assertAppName(app);
  const draft = draftPath(themeName, app);
  const original = originalPath(themeName, app);

  switch (action) {
    case "undo":
      handleUndo(themeName, app, draft);
      break;
    case "save":
      handleSave(themeName, app, draft, original);
      break;
    case "discard":
      handleDiscard(themeName, app, draft, original);
      break;
  }

  return buildAppState(themeName);
}

type PaletteError = { cause: string; user: boolean };

// TODO: We need a proper result/error lib here
export function isPaletteError(obj: object): obj is PaletteError {
  if ((obj as PaletteError).cause != null) {
    return true;
  }
  return false;
}

export async function handleSlotEdit(
  themeName: string,
  app: AppName,
  req: SlotEditBody,
): Promise<AppState | PaletteError> {
  const { slotId, newPaletteKey } = req;
  const draft = await ensureDraft(themeName, app);
  const current = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(current);
  if (!palette.has(newPaletteKey.toLowerCase())) {
    return {
      user: true,
      cause: `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`,
    };
  }
  const slots = discoverSlots(current, palette, "name-token");
  const slot = slots.find(s => s.id === slotId);
  if (!slot)
    return {
      user: false,
      cause: `slot '${slotId}' not found in current file (file may have changed)`,
    };

  pushHistory(themeName, app, current);
  const next = current.slice(0, slot.start) + newPaletteKey + current.slice(slot.end);
  await fs.writeFile(draft, next, "utf8");
  return buildAppState(themeName);
}
