import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleAction, handleSlotEdit } from "../src/server";
import { AppState } from "@playground/lib/types";

// server.ts reads THEMES_DIR at import time and binds a port unless run as the
// main module, so the env must be set before the dynamic import below.
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "theme-playground-"));
  const fixture = path.join(import.meta.dir, "fixtures", "themes", "bamboo");
  await fs.cp(fixture, path.join(tmpDir, "bamboo"), { recursive: true });
  process.env.THEMES_DIR = tmpDir;
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("save clears undo history so undo is no longer available", async () => {
  const editResponse  = await handleSlotEdit("bamboo", "starship", { slotId: "os/style/bg/1@799", newPaletteKey: "string" } )
  expect(editResponse).toHaveProperty("app")
  const appState = editResponse as AppState;
  expect(appState.dirty).toBeTrue();
  expect(appState.canUndo).toBeTrue();

  const saveResponse = await handleAction("bamboo", "starship", "save")
  const afterSave = saveResponse as AppState;
  expect(afterSave.dirty).toBe(false);
  expect(afterSave.canUndo).toBe(false);
});
