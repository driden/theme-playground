import path from "node:path";

import { config } from "@playground/lib/config";
import type { AppName } from "@playground/lib/types";

export const APP_CONFIG_FILE: Record<AppName, string> = {
  starship: "starship.toml",
};

export function originalPath(theme: string, app: AppName): string {
  return path.join(config().themesDir, theme, APP_CONFIG_FILE[app]);
}

export { config };
