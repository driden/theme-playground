// Walks the first `format = "…"` line in the file (the root format by
// convention) and returns an ordered list of its components: each `[](...)`
// transition and each `$module` reference, in the order they render in the
// prompt. Lets the slot table show modules interleaved with transitions
// instead of two opaque blocks.

export type FormatToken = { type: "transition" } | { type: "module"; name: string };

export function parseFormatTokens(fileRaw: string): FormatToken[] {
  const m = fileRaw.match(/^format\s*=\s*(?:"""([\s\S]*?)"""|"([^"]*)"|'([^']*)')/m);
  let content = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  // Strip commented-out lines (e.g. `#$c\` left in templates) so they don't
  // get counted as live module references.
  content = content.replace(/^[ \t]*#[^\n]*/gm, "");
  const tokens: FormatToken[] = [];
  const re = /\]\([^)]*\)|\$\{?([A-Za-z_]\w*)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(content)) !== null) {
    if (t[0].startsWith("](")) tokens.push({ type: "transition" });
    else if (t[1]) tokens.push({ type: "module", name: t[1] });
  }
  return tokens;
}
