import {
  AppStateSchema,
  ThemeStateSchema,
  ThemeListingSchema,
  ErrorResponseSchema,
  errMessage,
  type AppState,
  type ThemeState,
  type ColorSlot,
  type ThemeListing,
} from "./lib/types";
import { z } from "zod";

export type { AppState, ThemeState, ColorSlot, ThemeListing };

const ThemeListingArraySchema = z.array(ThemeListingSchema);

async function parseOrThrow<T>(res: Response, schema: z.ZodType<T>, context: string): Promise<T> {
  const body: unknown = await res.json();
  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : `${context} failed (${res.status})`);
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(`${context} response shape invalid: ${errMessage(result.error)}`);
  }
  return result.data;
}

export async function listThemes(): Promise<ThemeListing[]> {
  const res = await fetch("/api/themes");
  return parseOrThrow(res, ThemeListingArraySchema, "GET /api/themes");
}

export async function getTheme(name: string): Promise<ThemeState> {
  const res = await fetch(`/api/themes/${name}`);
  return parseOrThrow(res, ThemeStateSchema, `GET /api/themes/${name}`);
}

export async function editSlot(
  themeName: string,
  slotId: string,
  newPaletteKey: string,
): Promise<AppState> {
  const res = await fetch(`/api/themes/${themeName}/starship`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slotId, newPaletteKey }),
  });
  return parseOrThrow(res, AppStateSchema, "edit");
}

export async function editSection(
  themeName: string,
  sectionName: string,
  newPaletteKey: string,
): Promise<AppState> {
  const res = await fetch(`/api/themes/${themeName}/starship/section`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionName, newPaletteKey }),
  });
  return parseOrThrow(res, AppStateSchema, "editSection");
}

async function postAction(
  themeName: string,
  action: "undo" | "save" | "discard",
): Promise<AppState> {
  const res = await fetch(`/api/themes/${themeName}/starship/${action}`, { method: "POST" });
  return parseOrThrow(res, AppStateSchema, action);
}

export const undoEdit = (themeName: string) => postAction(themeName, "undo");
export const saveDraft = (themeName: string) => postAction(themeName, "save");
export const discardDraft = (themeName: string) => postAction(themeName, "discard");
