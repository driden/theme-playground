import { z } from "zod";

export const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .brand<"HexColor">();
export type HexColor = z.infer<typeof HexColorSchema>;

// Semantic palette roles, established when extracting themes from neovim.
// Three groups: chrome (UI surface), syntax (token kinds), diagnostics (LSP).
// Single source of truth: the type is derived from the array, so adding a
// name here registers it for both compile-time and runtime use.
const SEMANTIC_ROLES = [
  // chrome
  "background",
  "foreground",
  "cursor",
  "selection_background",
  "selection_foreground",
  "accent",
  // syntax
  "comment",
  "keyword",
  "string",
  "function",
  "type",
  "number",
  "variable",
  "constant",
  "operator",
  "property",
  "parameter",
  // diagnostics
  "error",
  "warning",
  "info",
  "hint",
] as const;
export type SemanticRole = (typeof SEMANTIC_ROLES)[number];

// X11 / legacy palette slots — positional, no semantic meaning. These live in
// each app's own config (e.g. starship.toml's [palettes.theme] table), NOT in
// the theme-level colors.toml. So they're not part of `Palette` below.
export type AnsiRole =
  `color${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`;

export type PaletteRole = SemanticRole | AnsiRole;

const SEMANTIC_ROLE_SET = new Set<string>(SEMANTIC_ROLES);
export const isSemanticRole = (s: string): s is SemanticRole => SEMANTIC_ROLE_SET.has(s);

// The colors.toml palette. Every semantic role must be present and a valid hex
// color. Extra keys (including ANSI slots) are rejected at the boundary.
export type Palette = { [K in SemanticRole]: HexColor };

const paletteShape = Object.fromEntries(SEMANTIC_ROLES.map(role => [role, HexColorSchema])) as {
  [K in SemanticRole]: typeof HexColorSchema;
};
export const PaletteSchema = z.object(paletteShape).strict();

export const SlotRoleSchema = z.enum(["fg", "bg"]);
export type SlotRole = z.infer<typeof SlotRoleSchema>;

export type SlotMode = "name-token" | "hex-literal";

export const ColorSlotSchema = z.object({
  id: z.string(), // stable: `${section}/${field}/${role}/${occ}@${start}`
  section: z.string(), // table name; root context -> "format"
  field: z.string(), // e.g. "style", "style_user", or "format (#N)" for bracketed
  role: SlotRoleSchema,
  key: z.string(), // captured token, original case preserved
  start: z.number(), // JS-string index of first char of key
  end: z.number(), // exclusive
});
export type ColorSlot = z.infer<typeof ColorSlotSchema>;

export type SlotId = string & { readonly __brand: "SlotId" };
export const asSlotId = (s: string): SlotId => s as SlotId;

export const APPS = ["starship"] as const;
export const AppNameSchema = z.enum(APPS);
export type AppName = z.infer<typeof AppNameSchema>;
export const isAppName = (s: string): s is AppName => (APPS as readonly string[]).includes(s);

export const AppStateSchema = z.object({
  app: AppNameSchema,
  fileRaw: z.string(),
  colorSlots: z.array(ColorSlotSchema),
  preview: z.union([z.null(), z.object({ kind: z.literal("ansi"), data: z.string() })]),
  previewError: z.string().nullable(),
  slotError: z.string().nullable(),
  dirty: z.boolean(),
  canUndo: z.boolean(),
});
export type AppState = z.infer<typeof AppStateSchema>;

export const ThemeStateSchema = z.object({
  name: z.string(),
  palette: PaletteSchema,
  apps: z.array(AppStateSchema),
});
export type ThemeState = z.infer<typeof ThemeStateSchema>;

export const ThemeListingSchema = z.object({
  name: z.string(),
  current: z.boolean(),
});
export type ThemeListing = z.infer<typeof ThemeListingSchema>;

export const ErrorResponseSchema = z.object({ error: z.string() });

export const SlotEditBodySchema = z.object({
  slotId: z.string().min(1),
  newPaletteKey: z.string().min(1),
});
export type SlotEditBody = z.infer<typeof SlotEditBodySchema>;

export const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
