import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import TOML from "@iarna/toml";
import { discoverSlots, paletteKeysFromStarshipToml } from "./src/lib/slot-discovery";
import type { AppState, ThemeState, ColorSlot } from "./src/lib/types";
import { errMessage } from "./src/lib/types";

// THEMES_DIR can be pointed at any directory containing per-theme subdirs
// (each with colors.toml + starship.toml). Defaults to ../themes for a
// repo-local layout but the env var lets the playground run standalone
// against any dotfiles checkout.
const THEMES_DIR = process.env.THEMES_DIR
  ?? path.resolve(import.meta.dir, "../themes");
const REPO_ROOT = path.resolve(THEMES_DIR, "..");
const DRAFTS_DIR = path.join(import.meta.dir, ".drafts");

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function parseSlotEditBody(x: unknown): { slotId: string; newPaletteKey: string } | null {
  if (typeof x !== "object" || x === null) return null;
  const obj = x as Record<string, unknown>;
  if (typeof obj.slotId !== "string" || typeof obj.newPaletteKey !== "string") return null;
  return { slotId: obj.slotId, newPaletteKey: obj.newPaletteKey };
}

// ── path / draft helpers ─────────────────────────────────────────────────────

function originalPath(theme: string, app: string): string {
  return path.join(THEMES_DIR, theme, `${app}.toml`);
}
function draftPath(theme: string, app: string): string {
  return path.join(DRAFTS_DIR, `${theme}-${app}.toml`);
}

// First touch: copy original → draft. Idempotent on subsequent calls.
async function ensureDraft(theme: string, app: string): Promise<string> {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  const draft = draftPath(theme, app);
  if (!(await Bun.file(draft).exists())) {
    const original = await fs.readFile(originalPath(theme, app), "utf8");
    await fs.writeFile(draft, original);
  }
  return draft;
}

async function isDirty(theme: string, app: string): Promise<boolean> {
  const d = await fs.readFile(draftPath(theme, app), "utf8");
  const o = await fs.readFile(originalPath(theme, app), "utf8");
  return d !== o;
}

// ── undo stack (in-memory, per theme+app) ────────────────────────────────────

const HISTORY_LIMIT = 50;
const histories = new Map<string, string[]>();
const histKey = (t: string, a: string) => `${t}/${a}`;

function pushHistory(theme: string, app: string, snapshot: string) {
  const k = histKey(theme, app);
  const stack = histories.get(k) ?? [];
  stack.push(snapshot);
  if (stack.length > HISTORY_LIMIT) stack.shift();
  histories.set(k, stack);
}
function popHistory(theme: string, app: string): string | null {
  return histories.get(histKey(theme, app))?.pop() ?? null;
}
function canUndo(theme: string, app: string): boolean {
  return (histories.get(histKey(theme, app)) ?? []).length > 0;
}
function clearHistory(theme: string, app: string) {
  histories.delete(histKey(theme, app));
}

// ── theme listing / palette ──────────────────────────────────────────────────

async function listThemes(): Promise<{ name: string; current: boolean }[]> {
  const entries = await fs.readdir(THEMES_DIR, { withFileTypes: true });
  const names = entries
    .filter(e => e.isDirectory() && e.name !== "templates")
    .map(e => e.name)
    .sort();

  let current = "";
  const namePath = path.join(os.homedir(), ".config/themes/current/name");
  const nameFile = Bun.file(namePath);
  if (await nameFile.exists()) current = (await nameFile.text()).trim();

  return names.map(name => ({ name, current: name === current }));
}

async function assertThemeExists(themeName: string): Promise<void> {
  const themes = await listThemes();
  if (!themes.some(t => t.name === themeName)) {
    throw new HttpError(404, "unknown theme");
  }
}

async function readPalette(themeName: string): Promise<Record<string, string>> {
  const text = await fs.readFile(path.join(THEMES_DIR, themeName, "colors.toml"), "utf8");
  const parsed = TOML.parse(text) as { palette?: Record<string, string> };
  return parsed.palette ?? {};
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
    const p = url.pathname;
    try {
      if (req.method === "GET" && p === "/api/themes") {
        return json(await listThemes());
      }
      const themeMatch = p.match(/^\/api\/themes\/([\w-]+)$/);
      if (req.method === "GET" && themeMatch) {
        const themeName = themeMatch[1]!;
        await assertThemeExists(themeName);
        return json(await buildThemeState(themeName));
      }

      // POST /api/themes/:name/:app/(undo|save|discard) — draft actions
      const actionMatch = p.match(/^\/api\/themes\/([\w-]+)\/([\w-]+)\/(undo|save|discard)$/);
      if (req.method === "POST" && actionMatch) {
        const themeName = actionMatch[1]!;
        const app = actionMatch[2]!;
        const action = actionMatch[3]!;
        await assertThemeExists(themeName);
        if (app !== "starship") throw new HttpError(404, `app '${app}' not supported in v1`);
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
      const editMatch = p.match(/^\/api\/themes\/([\w-]+)\/([\w-]+)$/);
      if (req.method === "POST" && editMatch) {
        const themeName = editMatch[1]!;
        const app = editMatch[2]!;
        await assertThemeExists(themeName);
        if (app !== "starship") throw new HttpError(404, `app '${app}' not supported in v1`);
        const body = parseSlotEditBody(await req.json());
        if (body === null) {
          throw new HttpError(400, "invalid body: expected { slotId: string, newPaletteKey: string }");
        }
        const draft = await ensureDraft(themeName, app);
        const current = await fs.readFile(draft, "utf8");
        const palette = paletteKeysFromStarshipToml(current);
        if (!palette.has(body.newPaletteKey.toLowerCase())) {
          throw new HttpError(400, `key '${body.newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`);
        }
        const slots = discoverSlots(current, palette, "name-token");
        const slot = slots.find(s => s.id === body.slotId);
        if (!slot) throw new HttpError(409, `slot '${body.slotId}' not found in current file (file may have changed)`);

        pushHistory(themeName, app, current);
        const next = current.slice(0, slot.start) + body.newPaletteKey + current.slice(slot.end);
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
