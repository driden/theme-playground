import fs from "node:fs/promises";

import { readPalette, readSections, themeExists } from "@playground/lib/themes";
import { type AppName, type AppState, isAppName, type ThemeState } from "@playground/lib/types";

import { draftPath, ensureDraft, handleDiscard, handleSave, isDirty } from "../draft";
import { paletteKeysFromStarshipToml, tryDiscoverSlots } from "../slot-discovery";
import { render } from "./starship";
import { originalPath } from "../config";
import { canUndo } from "../history";
import { handleUndo } from "../server";
import { HttpError } from "../http.error";

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

async function assertThemeExists(themeName: string): Promise<void> {
  if (!(await themeExists(themeName))) throw new HttpError(404, "unknown theme");
}

function assertAppName(app: string): asserts app is AppName {
  if (!isAppName(app)) throw new HttpError(404, `app '${app}' not supported`);
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
