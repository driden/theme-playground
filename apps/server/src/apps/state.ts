import fs from "node:fs/promises";

import { readPalette, readSections } from "../themes";
import type { AppState, ThemeState } from "@playground/lib/types";

import { draftPath, ensureDraft, isDirty } from "../draft";
import { paletteKeysFromStarshipToml, tryDiscoverSlots } from "../slot-discovery";
import { render } from "./starship";
import { canUndo } from "../history";

export async function buildAppState(themeName: string): Promise<AppState> {
  const draft = await ensureDraft(themeName, "starship");
  const fileRaw = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(fileRaw);
  const { colorSlots, slotError } = tryDiscoverSlots(fileRaw, palette);
  const { ansi, error: previewError } = await render(themeName, draftPath(themeName, "starship"));
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

export async function buildThemeState(themeName: string): Promise<ThemeState> {
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
