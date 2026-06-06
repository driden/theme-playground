import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import TOML from "@iarna/toml";
import { PaletteSchema, type Palette, type ThemeListing } from "./types";

// THEMES_DIR can be pointed at any directory containing per-theme subdirs
// (each with colors.toml + starship.toml). Defaults to ../themes for a
// repo-local layout but the env var lets the playground run standalone
// against any dotfiles checkout.
export const THEMES_DIR =
  process.env.THEMES_DIR ?? path.resolve(import.meta.dir, "../../../themes");

async function readCurrentThemeName(): Promise<string> {
  const namePath = path.join(os.homedir(), ".config/themes/current/name");
  const nameFile = Bun.file(namePath);
  return (await nameFile.exists()) ? (await nameFile.text()).trim() : "";
}

export async function listThemes(): Promise<ThemeListing[]> {
  const entries = await fs.readdir(THEMES_DIR, { withFileTypes: true });
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
  const text = await fs.readFile(path.join(THEMES_DIR, themeName, "colors.toml"), "utf8");
  const parsed = TOML.parse(text) as { palette?: unknown };
  return PaletteSchema.parse(parsed.palette ?? {});
}
