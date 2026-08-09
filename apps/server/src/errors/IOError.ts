import type { PlaygroundError } from "@playground/lib/types";

export type IOError =
  | CurrentThemeFolderMissingError
  | CantReadCurrentFolderLinkError
  | CantReadThemesFolder;

type CurrentThemeFolderMissingError = PlaygroundError<
  "CurrentThemeFolderMissing",
  { path: string }
>;
type CantReadCurrentFolderLinkError = PlaygroundError<
  "CantReadCurrentFolderLink",
  {
    path: string;
    error?: unknown;
  }
>;

type CantReadThemesFolder = PlaygroundError<
  "CantReadThemesFolder",
  {
    path: string;
    error?: unknown;
  }
>;

export const IOErrors = {
  currentThemeFolderMissing: (path: string): CurrentThemeFolderMissingError => ({
    kind: "CurrentThemeFolderMissing",
    message: `Theme folder not found at: ${path}`,
    path,
  }),
  cantReadCurrentFolderLink: (path: string, error?: unknown): CantReadCurrentFolderLinkError => ({
    kind: "CantReadCurrentFolderLink",
    message: `Could not read symlink at: ${path}`,
    path,
    error,
  }),
  cantReadThemesFolder: (path: string, error?: unknown): CantReadThemesFolder => ({
    kind: "CantReadThemesFolder",
    message: `Could not read themes folder: ${path}`,
    path,
    error,
  }),
};
