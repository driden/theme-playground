import path from "node:path";

type Config = { 
    themesDir : string
}

export const config = (() => {
    let instance: Config | null = null;
    return () => {
        if (instance == null) {
            instance = { themesDir: process.env.THEMES_DIR ?? 
                path.resolve(import.meta.dir) };
        }
        return instance;
    };
})();
