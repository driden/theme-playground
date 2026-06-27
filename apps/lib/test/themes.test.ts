import { describe, it, expect, mock, beforeEach } from "bun:test";
import { readCurrentThemeName } from "../src/themes";

const mockExists = mock();
const mockReadlink = mock();

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

    const result = await readCurrentThemeName();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("mytheme");
  });

  it("returns CurrentThemeFolderMissing when path does not exist", async () => {
    mockExists.mockResolvedValue(false);

    const result = await readCurrentThemeName();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("CurrentThemeFolderMissing");
  });

  it("returns CantReadCurrentFolderLink when readlink fails", async () => {
    mockExists.mockResolvedValue(true);
    mockReadlink.mockRejectedValue(new Error("EACCES: permission denied"));

    const result = await readCurrentThemeName();

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.kind).toBe("CantReadCurrentFolderLink");
  });
});
