import fs from "node:fs/promises";
import path from "node:path";
import TOML from "@iarna/toml";
import {
  PaletteSchema,
  SectionConfigSchema,
  type Palette,
  type ThemeListing,
  type SectionConfig,
  type AppName,
} from "@playground/lib/types";

import { config } from "./config";
import { type IOError, IOErrors } from "./errors/IOError";
import { fromPromise } from "./utils/purify";
import { EitherAsync, Left, Right } from "purify-ts";

export function readCurrentThemeName(): EitherAsync<IOError, string> {
  const namePath = config().currentThemePath;
  return EitherAsync<IOError, boolean>(() => fs.exists(namePath))
    .chain(exists =>
      EitherAsync.liftEither<IOError, string>(
        exists ? Right(namePath) : Left(IOErrors.currentThemeFolderMissing(namePath)),
      ),
    )
    .chain(currentThemePath =>
      fromPromise<IOError, string>(
        () => fs.readlink(currentThemePath),
        error => IOErrors.cantReadCurrentFolderLink(namePath, error),
      ),
    )
    .map(path.basename);
}

export function listThemes(): EitherAsync<IOError, ThemeListing[]> {
  const themes = fromPromise(
    () => fs.readdir(config().themesDir, { withFileTypes: true }),
    er => IOErrors.cantReadThemesFolder(config().themesDir, er),
  ).map(entries =>
    entries
      .filter(entry => entry.isDirectory() && entry.name !== "templates")
      .map(entry => entry.name),
  );

  const current = readCurrentThemeName();

  return themes.chain(names =>
    current.map(currentTheme => names.map(name => ({ name, current: name === currentTheme }))),
  );
}

export function themeExists(themeName: string): EitherAsync<IOError, boolean> {
  return listThemes().map(themes => themes.some(theme => theme.name === themeName));
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
