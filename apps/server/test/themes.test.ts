import { beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "node:fs/promises";

import type { EitherAsync } from "purify-ts";

const expectEitherToBe = <ErrorType extends { kind: string }, Value>(
  actual: EitherAsync<ErrorType, Value>,
  expectedValue: Value,
): Promise<void> =>
  actual.caseOf({
    Left: error => {
      throw new Error(`Expected Right, received Left(${error.kind})`);
    },
    Right: actualValue => {
      expect(actualValue).toEqual(expectedValue);
    },
  });

const expectEitherToBeErr = <ErrorType extends { kind: string }, Value>(
  actual: EitherAsync<ErrorType, Value>,
  expectedKind: ErrorType["kind"],
): Promise<void> =>
  actual.caseOf({
    Left: error => {
      expect(error.kind).toBe(expectedKind);
    },
    Right: actualValue => {
      throw new Error(`Expected Left(${expectedKind}), received Right(${String(actualValue)})`);
    },
  });

type DirectoryEntry = {
  name: string;
  isDirectory: () => boolean;
};

const mockExists = mock(async (_path: string): Promise<boolean> => false);
const mockReaddir = mock(async (_path: string): Promise<DirectoryEntry[]> => []);
const mockReadlink = mock(async (_path: string): Promise<string> => "");

mock.module("node:fs/promises", () => ({
  ...fs,
  default: {
    ...fs,
    exists: mockExists,
    readdir: mockReaddir,
    readlink: mockReadlink,
  },
}));

const { readCurrentThemeName, themeExists } = await import("../src/themes");

beforeEach(() => {
  mockExists.mockReset();
  mockReaddir.mockReset();
  mockReadlink.mockReset();
});

describe("readCurrentThemeName", () => {
  it("returns the theme name when everything succeeds", async () => {
    mockExists.mockResolvedValue(true);
    mockReadlink.mockResolvedValue("/home/user/.themes/mytheme");

    await expectEitherToBe(readCurrentThemeName(), "mytheme");
  });

  it("returns CurrentThemeFolderMissing when path does not exist", async () => {
    mockExists.mockResolvedValue(false);
    await expectEitherToBeErr(readCurrentThemeName(), "CurrentThemeFolderMissing");
  });

  it("returns CantReadCurrentFolderLink when readlink fails", async () => {
    mockExists.mockResolvedValue(true);
    mockReadlink.mockRejectedValue(new Error("EACCES: permission denied"));

    await expectEitherToBeErr(readCurrentThemeName(), "CantReadCurrentFolderLink");
  });
});

describe("themeExists", () => {
  it("returns Right(true) for an existing theme", async () => {
    mockReaddir.mockResolvedValue([
      { name: "bamboo", isDirectory: () => true },
      { name: "kanagawa", isDirectory: () => true },
    ]);
    mockExists.mockResolvedValue(true);
    mockReadlink.mockResolvedValue("/home/user/.themes/bamboo");

    await expectEitherToBe(themeExists("bamboo"), true);
  });

  it("returns Right(false) for a missing theme", async () => {
    mockReaddir.mockResolvedValue([
      { name: "bamboo", isDirectory: () => true },
      { name: "kanagawa", isDirectory: () => true },
    ]);
    mockExists.mockResolvedValue(true);
    mockReadlink.mockResolvedValue("/home/user/.themes/bamboo");

    await expectEitherToBe(themeExists("missing"), false);
  });

  it("returns Left when themes cannot be listed", async () => {
    mockReaddir.mockRejectedValue(new Error("EACCES: permission denied"));

    await expectEitherToBeErr(themeExists("bamboo"), "CantReadThemesFolder");
  });
});
