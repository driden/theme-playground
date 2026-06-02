import { z } from "zod";

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).brand<"HexColor">();
export type HexColor = z.infer<typeof HexColorSchema>;

// Semantic palette roles, established when extracting themes from neovim.
// Three groups: chrome (UI surface), syntax (token kinds), diagnostics (LSP).
// Single source of truth: the type is derived from the array, so adding a
// name here registers it for both compile-time and runtime use.
const SEMANTIC_ROLES = [
  // chrome
  "background", "foreground", "cursor",
  "selection_background", "selection_foreground", "accent",
  // syntax
  "comment", "keyword", "string", "function", "type",
  "number", "variable", "constant", "operator", "property", "parameter",
  // diagnostics
  "error", "warning", "info", "hint",
] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

// X11 / legacy palette slots — positional, no semantic meaning.
export type AnsiRole = `color${0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15}`;
const ANSI_ROLES: readonly AnsiRole[] =
  Array.from({ length: 16 }, (_, i) => `color${i}` as AnsiRole);

export type PaletteRole = SemanticRole | AnsiRole;

const PALETTE_ROLES = new Set<string>([...SEMANTIC_ROLES, ...ANSI_ROLES]);
export const isPaletteRole = (s: string): s is PaletteRole => PALETTE_ROLES.has(s);

// Every theme must populate every role — no optional keys, no theme-specific
// extras. If a theme needs a new role it goes into SEMANTIC_ROLES.
export type Palette = { [K in PaletteRole]: HexColor };

// Runtime validator for the file-read boundary. The `satisfies` check forces
// the shape to cover every PaletteRole at compile time — drop a role here and
// you get a type error, not a silent runtime miss.
const paletteShape = Object.fromEntries(
  [...SEMANTIC_ROLES, ...ANSI_ROLES].map(role => [role, HexColorSchema]),
) as { [K in PaletteRole]: typeof HexColorSchema };
export const PaletteSchema = z.object(paletteShape satisfies Record<PaletteRole, unknown>);

export type SlotRole = "fg" | "bg";
export type SlotMode = "name-token" | "hex-literal";

export type ColorSlot = {
  id: string;       // stable: `${section}/${field}/${role}/${occ}@${start}`
  section: string;  // table name; root context -> "format"
  field: string;    // e.g. "style", "style_user", or "format (#N)" for bracketed
  role: SlotRole;
  key: string;      // captured token, original case preserved
  start: number;    // JS-string index of first char of key
  end: number;      // exclusive
};

export type SlotId = string & { readonly __brand: "SlotId" };
export const asSlotId = (s: string): SlotId => s as SlotId;

export const APPS = ["starship"] as const;
export type AppName = typeof APPS[number];
export const isAppName = (s: string): s is AppName =>
  (APPS as readonly string[]).includes(s);

export type AppState = {
  app: AppName;
  fileRaw: string;
  colorSlots: ColorSlot[];
  preview: { kind: "ansi"; data: string } | null;
  previewError: string | null;
  slotError: string | null;
  dirty: boolean;
  canUndo: boolean;
};

export type ThemeState = {
  name: string;
  palette: Palette;
  apps: AppState[];
};

export const SlotEditBodySchema = z.object({
  slotId: z.string().min(1),
  newPaletteKey: z.string().min(1),
});
export type SlotEditBody = z.infer<typeof SlotEditBodySchema>;

export const errMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
