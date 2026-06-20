// Slot discovery for starship.toml (name-token mode).
// Uses tree-sitter-toml for TOML structure; hand-rolled code only for
// the starship DSL (style tokenizer + [label](style) extractor).
// top-level await initialises the parser once at module load.
import * as TreeSitter from "web-tree-sitter";
import { createRequire } from "node:module";
import { assertNonNull } from "@playground/lib/assert";
import { type ColorSlot, type SlotRole, type SlotMode } from "@playground/lib/types";

// Lifted from starship's parse_style_string.
const MODIFIERS = new Set([
  "underline",
  "bold",
  "italic",
  "dimmed",
  "inverted",
  "blink",
  "hidden",
  "strikethrough",
  "prev_fg",
  "prev_bg",
  "none",
]);

function isStyleField(name: string): boolean {
  return name === "style" || name.endsWith("_style") || name.startsWith("style_");
}

const { Parser, Language } = TreeSitter;
await Parser.init();
const require = createRequire(import.meta.url);
const wasmPath = require.resolve("@tree-sitter-grammars/tree-sitter-toml/tree-sitter-toml.wasm");
const lang = await Language.load(wasmPath);
const parser = new Parser();
parser.setLanguage(lang);

// Tree-sitter exposes `Node.child(i)` as nullable for valid out-of-range
// indices. childAt asserts the access is in range, narrowing to Node so call
// sites stay one-liners.
function childAt(node: TreeSitter.Node, i: number): TreeSitter.Node {
  const child = node.child(i);
  assertNonNull(child, `child[${i}] of ${node.type}`);
  return child;
}

function parseTree(text: string): TreeSitter.Tree {
  const tree = parser.parse(text);
  assertNonNull(tree, "tree-sitter parse");
  return tree;
}

// [contentStart, contentEnd] for a TOML string node — strips delimiters (1 or 3 chars).
function stringContent(node: TreeSitter.Node): [number, number] {
  const d = childAt(node, 0).text.length; // 1 for " / ', 3 for """ / '''
  return [node.startIndex + d, node.endIndex - d];
}

// Resolves the header key of a [table] or [[array-of-tables]] node.
// Handles bare (`foo`), dotted (`foo.bar`), and quoted (`"foo"`) keys.
function tableName(table: TreeSitter.Node): string {
  for (let i = 0; i < table.childCount; i++) {
    const c = childAt(table, i);
    if (c.type === "bare_key" || c.type === "dotted_key") return c.text;
    if (c.type === "quoted_key") return c.text.replace(/^["']|["']$/g, "");
  }
  return "format";
}

// Walk up to the nearest table ancestor; return its header key or "format".
function sectionOf(node: TreeSitter.Node): string {
  const parent = node.parent;
  if (!parent) return "format";
  if (parent.type === "table" || parent.type === "table_array_element") return tableName(parent);
  return sectionOf(parent);
}

function tokenizeSlice(
  source: string,
  sliceStart: number,
  sliceEnd: number,
  section: string,
  field: string,
  palette: Set<string>,
): ColorSlot[] {
  const re = /(fg:|bg:)?([A-Za-z_][A-Za-z0-9_]*)/g;
  const text = source.slice(sliceStart, sliceEnd);
  const kept = [...text.matchAll(re)].filter(match => {
    const name = match[2];
    if (!name) return false;
    const lower = name.toLowerCase();
    return !MODIFIERS.has(lower) && palette.has(lower);
  });
  return kept.map((match, i) => {
    const prefix = match[1];
    const name = match[2];
    assertNonNull(name, "tokenizeSlice: match[2]");
    const occ = i + 1;
    const role: SlotRole = prefix === "bg:" ? "bg" : "fg";
    const start = sliceStart + match.index + (prefix ? prefix.length : 0);
    return {
      id: `${section}/${field}/${role}/${occ}@${start}`,
      section,
      field,
      role,
      key: name,
      start,
      end: start + name.length,
    };
  });
}

// `occ` is per string value, not per (section, field) across the file. Works
// because each starship `format` is one string value, so per-value and
// per-field counters agree. If a future codebase splits formats across pairs,
// reconsider.
function bracketSlots(
  source: string,
  sliceStart: number,
  sliceEnd: number,
  section: string,
  field: string,
  palette: Set<string>,
): ColorSlot[] {
  const re = /\]\(([^)]*)\)/g;
  const text = source.slice(sliceStart, sliceEnd);
  return [...text.matchAll(re)].flatMap((match, i) => {
    const inner = match[1];
    assertNonNull(inner, "bracketSlots: match[1]");
    const occ = i + 1;
    const innerStart = sliceStart + match.index + 2; // skip `](`
    return tokenizeSlice(
      source,
      innerStart,
      innerStart + inner.length,
      section,
      `${field} (#${occ})`,
      palette,
    );
  });
}

export function discoverSlots(text: string, palette: Set<string>, mode: SlotMode): ColorSlot[] {
  switch (mode) {
    case "name-token":
      break;
    case "hex-literal":
      throw new Error("TODO: hex-literal mode not implemented (planned for tmux/fzf support)");
    default: {
      const _exh: never = mode;
      throw new Error(`unreachable: ${String(_exh)}`);
    }
  }

  const tree = parseTree(text);
  const styleOut: ColorSlot[] = [];
  const bracketOut: ColorSlot[] = [];

  // Walk every pair. Accumulate style-field slots and bracket slots separately
  // so the final order is: all style-field tokens, then all bracket tokens.
  // We don't early-return on pair so that inline_table values (which contain
  // nested pairs) are recursed into.
  function visit(node: TreeSitter.Node) {
    if (node.type === "pair") {
      const keyNode = childAt(node, 0);
      if (keyNode.type === "bare_key") {
        const keyName = keyNode.text;
        const valNode = node.child(2);
        if (valNode?.type === "string") {
          const [cs, ce] = stringContent(valNode);
          const section = sectionOf(node);
          if (isStyleField(keyName))
            styleOut.push(...tokenizeSlice(text, cs, ce, section, keyName, palette));
          bracketOut.push(...bracketSlots(text, cs, ce, section, keyName, palette));
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) visit(childAt(node, i));
  }

  visit(tree.rootNode);
  return [...styleOut, ...bracketOut];
}

export function paletteKeysFromStarshipToml(text: string): Set<string> {
  const tree = parseTree(text);
  const out = new Set<string>();
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const node = childAt(tree.rootNode, i);
    if (node.type !== "table") continue;
    // table layout: child(0) is "[", child(1) is the header key node.
    const headerKey = childAt(node, 1);
    if (headerKey.type !== "dotted_key") continue;
    const parts = headerKey.text.split(".");
    if (parts[0] !== "palettes" || parts.length !== 2) continue;
    for (let j = 0; j < node.childCount; j++) {
      const child = childAt(node, j);
      if (child.type === "pair") {
        const key = childAt(child, 0);
        if (key.type === "bare_key") out.add(key.text.toLowerCase());
      }
    }
  }
  return out;
}
