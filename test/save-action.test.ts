import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// server.ts reads THEMES_DIR at import time and binds a port unless run as the
// main module, so the env must be set before the dynamic import below.
let tmpDir: string;
let handleRequest: (req: Request) => Promise<Response>;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "theme-playground-"));
  const fixture = path.join(import.meta.dir, "fixtures", "themes", "bamboo");
  await fs.cp(fixture, path.join(tmpDir, "bamboo"), { recursive: true });
  process.env.THEMES_DIR = tmpDir;
  ({ handleRequest } = await import("../server"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("save clears undo history so undo is no longer available", async () => {
  const editResponse = await handleRequest(
    new Request("http://localhost/api/themes/bamboo/starship", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId: "os/style/bg/1@799", newPaletteKey: "string" }),
    }),
  );
  expect(editResponse.status).toBe(200);
  const afterEdit = await editResponse.json();
  expect(afterEdit.dirty).toBe(true);
  expect(afterEdit.canUndo).toBe(true);

  const saveResponse = await handleRequest(
    new Request("http://localhost/api/themes/bamboo/starship/save", { method: "POST" }),
  );
  expect(saveResponse.status).toBe(200);
  const afterSave = await saveResponse.json();
  expect(afterSave.dirty).toBe(false);
  expect(afterSave.canUndo).toBe(false);
});
