import os from "node:os";
import path from "node:path";

import type { AppName } from "@playground/lib/types";

export const APP_CONFIG_FILE: Record<AppName, string> = {
  starship: "starship.toml",
};

export function originalPath(theme: string, app: AppName): string {
  return path.join(config().themesDir, theme, APP_CONFIG_FILE[app]);
}

type Config = {
  themesDir: string;
  currentThemePath: string;
};

export const config = (() => {
  let instance: Config | null = null;
  return () => {
    if (instance == null) {
      instance = {
        themesDir: process.env.THEMES_DIR ?? path.resolve(import.meta.dir),
        currentThemePath: path.join(os.homedir(), ".config/themes/current"),
      };
    }
    return instance;
  };
})();
