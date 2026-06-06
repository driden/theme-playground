// Walks the first `format = "…"` line in the file (the root format by
// convention) and returns an ordered list of its components: each `[](...)`
// transition and each `$module` reference, in the order they render in the
// prompt. Lets the slot table show modules interleaved with transitions
// instead of two opaque blocks.

export type FormatToken = { type: "transition" } | { type: "module"; name: string };

// Matches the first `format = ...` assignment with one of three string forms.
// Capture groups 1/2/3 are the triple-quoted/double-quoted/single-quoted body.
// Examples it matches:
//   format = """[a]($style) $directory"""
//   format = "$directory $git_branch"
//   format = '[](color12)$git_branch'
const FORMAT_RE = /^format\s*=\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)')/m;

// Strips lines that begin (with optional leading whitespace) with `#`. Starship
// format strings often contain `#$c\` lines authors leave as scratch comments;
// they're not TOML comments (TOML doesn't allow # inside strings) and we don't
// want to count them as live module references.
const COMMENT_LINE_RE = /^[ \t]*#[^\n]*/gm;

// Matches either a transition (`](...)`) or a module reference (`$name` /
// `${name}`). Examples:
//   ](fg:color1)           → transition
//   $git_branch            → module name="git_branch"
//   ${env_var}             → module name="env_var"
const TOKEN_RE = /\]\([^)]*\)|\$\{?([A-Za-z_]\w*)/g;

export function parseFormatTokens(fileRaw: string): FormatToken[] {
  const formatMatch = fileRaw.match(FORMAT_RE);
  const content = (
    formatMatch ? (formatMatch[1] ?? formatMatch[2] ?? formatMatch[3] ?? "") : ""
  ).replace(COMMENT_LINE_RE, "");
  const tokens: FormatToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(content)) !== null) {
    if (match[0].startsWith("](")) tokens.push({ type: "transition" });
    else if (match[1]) tokens.push({ type: "module", name: match[1] });
  }
  return tokens;
}
