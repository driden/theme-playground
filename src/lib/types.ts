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

export type AppName = "starship";

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
  palette: Record<string, string>;
  apps: AppState[];
};

export const errMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
