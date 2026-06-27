export type ThemeError<S extends string, TExt extends object> = {
  kind: S;
  message: string;
} & TExt;
export type IOError =
  | CurrentThemeFolderMissingError
  | CantReadCurrentFolderLinkError
  | CantReadThemesFolder;

type CurrentThemeFolderMissingError = ThemeError<"CurrentThemeFolderMissing", { path: string }>;
type CantReadCurrentFolderLinkError = ThemeError<
  "CantReadCurrentFolderLink",
  {
    path: string;
    error?: unknown;
  }
>;

type CantReadThemesFolder = ThemeError<
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
