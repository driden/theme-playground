import path from "node:path";
import os from "node:os";

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
