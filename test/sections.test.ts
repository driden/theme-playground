import { describe, test, expect } from "bun:test";
import { resolveSection } from "../src/lib/sections";
import type { ColorSlot } from "../src/lib/types";
import type { FormatToken } from "../src/lib/format-tokens";

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

const config = [
  { name: "os", modules: ["os", "username"] },
  { name: "sep1" },
  { name: "cwd", modules: ["directory"] },
  { name: "sep2" },
  { name: "branch", modules: ["git_branch"] },
  { name: "sep3" },
  { name: "sep4" },
];

const slots: ColorSlot[] = [
  makeSlot("format", "format (#1)", "fg", "hint", 0),
  makeSlot("os", "style", "bg", "hint", 10),
  makeSlot("os", "style", "fg", "background", 15),
  makeSlot("username", "style_user", "bg", "hint", 25),
  makeSlot("format", "format (#2)", "bg", "hint", 35),
  makeSlot("format", "format (#2)", "fg", "function", 40),
  makeSlot("format", "format (#3)", "bg", "string", 50),
  makeSlot("format", "format (#3)", "fg", "function", 55),
  makeSlot("directory", "style", "bg", "string", 65),
  makeSlot("format", "format (#4)", "bg", "string", 75),
  makeSlot("format", "format (#4)", "fg", "number", 80),
  makeSlot("format", "format (#5)", "bg", "constant", 90),
  makeSlot("format", "format (#5)", "fg", "number", 95),
  makeSlot("git_branch", "style", "bg", "constant", 105),
  makeSlot("format", "format (#6)", "bg", "type", 115),
  makeSlot("format", "format (#6)", "fg", "type", 118),
  makeSlot("docker_context", "style", "bg", "background", 125),
  makeSlot("format", "format (#7)", "fg", "function", 135),
];

const tokens: FormatToken[] = [
  { type: "transition" },
  { type: "module", name: "os" },
  { type: "module", name: "username" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "directory" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "git_branch" },
  { type: "transition" },
  { type: "module", name: "docker_context" },
  { type: "transition" },
];

describe("resolveSection", () => {
  test("content section returns bg slots for style fields in its modules", () => {
    const result = resolveSection("os", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "os/style/bg",
      "username/style_user/bg",
    ]);
  });

  test("separator returns fg slots of its format bracket run", () => {
    const result = resolveSection("sep1", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "format/format (#2)/fg",
      "format/format (#3)/fg",
    ]);
  });

  test("second separator maps to the correct run", () => {
    const result = resolveSection("sep2", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "format/format (#4)/fg",
      "format/format (#5)/fg",
    ]);
  });

  test("trailing separators split correctly across non-content modules", () => {
    const sep3 = resolveSection("sep3", config, slots, tokens);
    expect(sep3.map(s => s.field)).toEqual(["format (#6)"]);
    const sep4 = resolveSection("sep4", config, slots, tokens);
    expect(sep4.map(s => s.field)).toEqual(["format (#7)"]);
  });

  test("returns empty array for unknown section name", () => {
    expect(resolveSection("unknown", config, slots, tokens)).toEqual([]);
  });

  test("content section ignores fg slots and non-style fields", () => {
    const result = resolveSection("branch", config, slots, tokens);
    expect(result.every(s => s.role === "bg")).toBe(true);
  });

  test("content section also owns the inner format-bracket bg (the visible one)", () => {
    // git_branch paints its visible background via an inner `[...](bg:number)`
    // bracket nested inside `$style` (bg:property); editing the section must
    // move both so the rendered segment actually changes color.
    const cfg = [{ name: "branch", modules: ["git_branch"] }];
    const branchSlots: ColorSlot[] = [
      makeSlot("git_branch", "style", "bg", "property", 0),
      makeSlot("git_branch", "format (#1)", "fg", "background", 10),
      makeSlot("git_branch", "format (#1)", "bg", "number", 20),
    ];
    const result = resolveSection("branch", cfg, branchSlots, []);
    expect(result.map(slot => `${slot.field}/${slot.role}=${slot.key}`).sort()).toEqual([
      "format (#1)/bg=number",
      "style/bg=property",
    ]);
  });
});
