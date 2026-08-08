import { afterAll, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { assertNonNull } from "@playground/lib/assert";
import type { AppName } from "@playground/lib/types";

const themesDir = "/virtual/themes";
const currentThemePath = "/virtual/current";
const appConfigFile: Record<AppName, string> = {
  starship: "starship.toml",
};

mock.module("../src/config", () => ({
  APP_CONFIG_FILE: appConfigFile,
  config: () => ({ themesDir, currentThemePath }),
  originalPath: (theme: string, app: AppName) => path.join(themesDir, theme, appConfigFile[app]),
}));

const mockMkdir = spyOn(fs, "mkdir");
const mockReadFile = spyOn(fs, "readFile");
const mockWriteFile = spyOn(fs, "writeFile");
const virtualFile = Bun.file(import.meta.path);
const mockFileExists = spyOn(virtualFile, "exists");
const mockBunFile = spyOn(Bun, "file");

type DraftModule = typeof import("../src/draft");
type HistoryModule = typeof import("../src/history");
let draft: DraftModule | null = null;
let history: HistoryModule | null = null;

beforeAll(async () => {
  draft = await import("../src/draft");
  history = await import("../src/history");
});

beforeEach(() => {
  mockMkdir.mockResolvedValue(undefined);
  mockReadFile.mockResolvedValue("edited draft");
  mockWriteFile.mockResolvedValue(undefined);
  mockFileExists.mockResolvedValue(true);
  mockBunFile.mockReturnValue(virtualFile);
});

afterAll(() => {
  mockMkdir.mockRestore();
  mockReadFile.mockRestore();
  mockWriteFile.mockRestore();
  mockFileExists.mockRestore();
  mockBunFile.mockRestore();
});

test("save clears undo history so undo is no longer available", async () => {
  assertNonNull(draft, "draft module");
  assertNonNull(history, "history module");

  const draftPath = path.join(themesDir, "bamboo", ".drafts", "starship", "starship.toml");
  const originalPath = path.join(themesDir, "bamboo", "starship.toml");

  history.pushHistory("bamboo", "starship", "original");
  expect(history.canUndo("bamboo", "starship")).toBeTrue();

  await draft.handleSave("bamboo", "starship", draftPath, originalPath);

  expect(mockReadFile).toHaveBeenCalledWith(draftPath, "utf8");
  expect(mockWriteFile).toHaveBeenCalledWith(originalPath, "edited draft", "utf8");
  expect(history.canUndo("bamboo", "starship")).toBeFalse();
});
