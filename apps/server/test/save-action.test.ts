import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppState } from "@playground/lib/types";
import { mock } from "bun:test";

// THEMES_DIR is a module-level const in @playground/lib/themes evaluated at
// import time, so we must set the env var BEFORE the server module is loaded.
// Use a dynamic import inside beforeAll — and critically, NO static import of
// the server module, or Bun's module cache would return the stale const.
let tmpDir: string;
type ServerModule = typeof import("../src/server");
let server: ServerModule | null = null;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "theme-playground-"));

  mock.module("@playground/lib/config", () => ({
    config: () => ({ themesDir: tmpDir }),
  }));
  const fixture = path.join(import.meta.dir, "fixtures", "themes", "bamboo");
  await fs.cp(fixture, path.join(tmpDir, "bamboo"), { recursive: true });
  server = await import("../src/server");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("save clears undo history so undo is no longer available", async () => {
  const editResponse = await server?.handleSlotEdit("bamboo", "starship", {
    slotId: "os/style/bg/1@799",
    newPaletteKey: "string",
  });
  expect(editResponse).toHaveProperty("app");
  const appState = editResponse as AppState;
  expect(appState.dirty).toBeTrue();
  expect(appState.canUndo).toBeTrue();

  const saveResponse = await server?.handleAction("bamboo", "starship", "save");
  const afterSave = saveResponse as AppState;
  expect(afterSave.dirty).toBe(false);
  expect(afterSave.canUndo).toBe(false);
});
