// Walks the first `format = "…"` line in the file (the root format by
// convention) and returns an ordered list of its components: each `[](...)`
// transition and each `$module` reference, in the order they render in the
// prompt. Lets the slot table show modules interleaved with transitions
// instead of two opaque blocks.

export type FormatToken = { type: "transition" } | { type: "module"; name: string };

// Matches the first `format = ...` assignment in one of three string forms.
// One regex per delimiter style; tried in order, first non-null wins. Each
// regex has exactly one capture group (the body), so the call site reads as
// a single string lookup with no group-by-group fallback.
//   format = """[a]($style) $directory"""    → FORMAT_TRIPLE_RE
//   format = "$directory $git_branch"        → FORMAT_DOUBLE_RE
//   format = '[](color12)$git_branch'        → FORMAT_SINGLE_RE
const FORMAT_TRIPLE_RE = /^format\s*=\s*"""([\s\S]*?)"""/m;
const FORMAT_DOUBLE_RE = /^format\s*=\s*"([^"]*)"/m;
const FORMAT_SINGLE_RE = /^format\s*=\s*'([^']*)'/m;
const FORMAT_BODY_RES = [FORMAT_TRIPLE_RE, FORMAT_DOUBLE_RE, FORMAT_SINGLE_RE];

function extractFormatBody(fileRaw: string): string {
  for (const re of FORMAT_BODY_RES) {
    const match = fileRaw.match(re);
    if (match) return match[1] ?? "";
  }
  return "";
}

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
  const content = extractFormatBody(fileRaw).replace(COMMENT_LINE_RE, "");
  const tokens: FormatToken[] = [];
  for (const match of content.matchAll(TOKEN_RE)) {
    if (match[0].startsWith("](")) tokens.push({ type: "transition" });
    else if (match[1]) tokens.push({ type: "module", name: match[1] });
  }
  return tokens;
}
