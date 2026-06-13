import { describe, test, expect } from "bun:test";
import { resolveSection, sectionStripes } from "../src/sections";
import type { ColorSlot } from "../src/types";
import type { FormatToken } from "../src/format-tokens";

function makeSlot(
  section: string,
  field: string,
  role: "bg" | "fg",
  key: string,
  idx = 0,
): ColorSlot {
  return {
    id: `${section}/${field}/${role}/1@${idx}`,
    section,
    field,
    role,
    key,
    start: idx,
    end: idx + key.length,
  };
}

// A small but realistic powerline chain (mirrors the bamboo prompt structure):
//   [](kw) $os [](kw->fn)[](fn->pr) $directory [](pr->ty)[](ty->nu)
//   $git_branch [](nu->st)[](st)
// git_branch paints its visible bg via an inner bracket (number); its `style` bg
// (property) is covered and must be ignored.
const config = [
  { name: "os", modules: ["os"] },
  { name: "sep1" },
  { name: "cwd", modules: ["directory"] },
  { name: "sep2" },
  { name: "branch", modules: ["git_branch"] },
  { name: "sep3" },
];

const slots: ColorSlot[] = [
  makeSlot("format", "format (#1)", "fg", "keyword", 0),
  makeSlot("os", "style", "bg", "keyword", 10),
  makeSlot("os", "style", "fg", "background", 15),
  makeSlot("format", "format (#2)", "fg", "keyword", 25),
  makeSlot("format", "format (#2)", "bg", "function", 30),
  makeSlot("format", "format (#3)", "fg", "function", 35),
  makeSlot("format", "format (#3)", "bg", "property", 40),
  makeSlot("directory", "style", "bg", "property", 50),
  makeSlot("directory", "style", "fg", "background", 55),
  makeSlot("format", "format (#4)", "fg", "property", 60),
  makeSlot("format", "format (#4)", "bg", "type", 65),
  makeSlot("format", "format (#5)", "fg", "type", 70),
  makeSlot("format", "format (#5)", "bg", "number", 75),
  makeSlot("git_branch", "style", "bg", "property", 85),
  makeSlot("git_branch", "format (#1)", "fg", "background", 90),
  makeSlot("git_branch", "format (#1)", "bg", "number", 95),
  makeSlot("format", "format (#6)", "fg", "number", 105),
  makeSlot("format", "format (#6)", "bg", "string", 110),
  makeSlot("format", "format (#7)", "fg", "string", 115),
];

const tokens: FormatToken[] = [
  { type: "transition" },
  { type: "module", name: "os" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "directory" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "git_branch" },
  { type: "transition" },
  { type: "transition" },
];

const ids = (result: ColorSlot[]) =>
  result.map(slot => `${slot.section}/${slot.field}/${slot.role}`);

describe("resolveSection", () => {
  test("content section owns its segment bg plus the bordering transition edges", () => {
    // os = the leading arrow, the os segment background, and the arrow leaving os
    expect(ids(resolveSection("os", config, slots, tokens))).toEqual([
      "format/format (#1)/fg",
      "os/style/bg",
      "format/format (#2)/fg",
    ]);
  });

  test("a separator is the intermediate stripe between two content sections", () => {
    expect(ids(resolveSection("sep1", config, slots, tokens))).toEqual([
      "format/format (#2)/bg",
      "format/format (#3)/fg",
    ]);
    expect(ids(resolveSection("sep2", config, slots, tokens))).toEqual([
      "format/format (#4)/bg",
      "format/format (#5)/fg",
    ]);
    expect(ids(resolveSection("sep3", config, slots, tokens))).toEqual([
      "format/format (#6)/bg",
      "format/format (#7)/fg",
    ]);
  });

  test("cwd spans its entering edge, segment bg, and leaving edge", () => {
    expect(ids(resolveSection("cwd", config, slots, tokens))).toEqual([
      "format/format (#3)/bg",
      "directory/style/bg",
      "format/format (#4)/fg",
    ]);
  });

  test("branch uses the visible inner bracket bg, not the covered style bg", () => {
    const result = resolveSection("branch", config, slots, tokens);
    expect(ids(result)).toEqual([
      "format/format (#5)/bg",
      "git_branch/format (#1)/bg",
      "format/format (#6)/fg",
    ]);
    // the hidden style bg (property) must not be touched
    expect(result.some(slot => slot.field === "style")).toBe(false);
  });

  test("every targeted slot of a section shares the section's color", () => {
    for (const stripe of sectionStripes(config, slots, tokens)) {
      if (stripe.color === null) continue;
      for (const slot of stripe.slots) expect(slot.key).toBe(stripe.color);
    }
  });

  test("returns empty array for unknown section name", () => {
    expect(resolveSection("unknown", config, slots, tokens)).toEqual([]);
  });
});

describe("sectionStripes", () => {
  test("maps each config entry, in order, to its stripe color", () => {
    const colors = sectionStripes(config, slots, tokens).map(stripe => ({
      name: stripe.name,
      color: stripe.color,
    }));
    expect(colors).toEqual([
      { name: "os", color: "keyword" },
      { name: "sep1", color: "function" },
      { name: "cwd", color: "property" },
      { name: "sep2", color: "type" },
      { name: "branch", color: "number" },
      { name: "sep3", color: "string" },
    ]);
  });
});
