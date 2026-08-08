import { describe, it, expect, mock, beforeEach } from "bun:test";
import { readCurrentThemeName } from "../src/themes";
import type { EitherAsync } from "purify-ts";

const mockExists = mock();
const mockReadlink = mock();

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

mock.module("node:fs/promises", () => ({
  default: {
    exists: mockExists,
    readlink: mockReadlink,
  },
}));

beforeEach(() => {
  mockExists.mockReset();
  mockReadlink.mockReset();
});

describe("readCurrentThemeName", () => {
  it("returns the theme name when everything succeeds", async () => {
    mockExists.mockResolvedValue(true);
    mockReadlink.mockResolvedValue("/home/user/.themes/mytheme");

    expectEitherToBe(readCurrentThemeName(), "mytheme");
  });

  it("returns CurrentThemeFolderMissing when path does not exist", async () => {
    mockExists.mockResolvedValue(false);
    expectEitherToBeErr(readCurrentThemeName(), "CurrentThemeFolderMissing");
  });

  it("returns CantReadCurrentFolderLink when readlink fails", async () => {
    mockExists.mockResolvedValue(true);
    mockReadlink.mockRejectedValue(new Error("EACCES: permission denied"));

    expectEitherToBeErr(readCurrentThemeName(), "CantReadCurrentFolderLink");
  });
});
