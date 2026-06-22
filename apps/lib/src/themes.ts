import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import TOML from "@iarna/toml";
import {
  PaletteSchema,
  SectionConfigSchema,
  type Palette,
  type ThemeListing,
  type SectionConfig,
  type AppName,
} from "./types";

import { config } from "./config"

async function readCurrentThemeName(): Promise<string> {
  const namePath = path.join(os.homedir(), ".config/themes/current/name");
  const nameFile = Bun.file(namePath);
  return (await nameFile.exists()) ? (await nameFile.text()).trim() : "";
}

export async function listThemes(): Promise<ThemeListing[]> {
  const entries = await fs.readdir(config().themesDir, { withFileTypes: true });
  const names = entries
    .filter(entry => entry.isDirectory() && entry.name !== "templates")
    .map(entry => entry.name)
    .sort();
  const current = await readCurrentThemeName();
  return names.map(name => ({ name, current: name === current }));
}

export async function themeExists(themeName: string): Promise<boolean> {
  const themes = await listThemes();
  return themes.some(theme => theme.name === themeName);
}

export async function readPalette(themeName: string): Promise<Palette> {
  const text = await fs.readFile(path.join(config().themesDir, themeName, "colors.toml"), "utf8");
  const parsed = TOML.parse(text) as { palette?: unknown };
  return PaletteSchema.parse(parsed.palette ?? {});
}

// Per-app sections-config filename, parallel to the app's main config
// (starship.toml -> starship.sections.json). Flat in the theme dir, same as
// the source files it describes.
const APP_SECTIONS_FILE: Record<AppName, string> = {
  starship: "starship.sections.json",
};

// Resolves the sections config for a theme+app. Prefers the theme's own file,
// then falls back to the shared stub in templates/ — every theme is generated
// from templates/starship.toml.tmpl and shares one prompt structure, so a
// single stub lights up all themes. Returns null when neither exists; if a
// present file is malformed, warns and returns null (the explicit file wins —
// we don't silently fall through to the template on a typo).
export async function readSections(themeName: string, app: AppName): Promise<SectionConfig | null> {
  const filename = APP_SECTIONS_FILE[app];
  const candidates = [
    path.join(config().themesDir, themeName, filename),
    path.join(config().themesDir, "templates", filename),
  ];
  for (const candidate of candidates) {
    const file = Bun.file(candidate);
    if (!(await file.exists())) continue;
    const raw: unknown = await file.json();
    const result = SectionConfigSchema.safeParse(raw);
    if (!result.success) {
      console.warn(`${candidate} is invalid: ${result.error.message}`);
      return null;
    }
    return result.data;
  }
  return null;
}
