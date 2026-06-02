import { describe, expect, test } from "bun:test";
import { groupSlots, orderByPrompt } from "../src/components/ColorSlotTable";
import type { ColorSlot } from "../src/lib/slot-discovery";
import type { FormatToken } from "../src/lib/format-tokens";

function slot(partial: Partial<ColorSlot> & { section: string; field: string; role: "fg" | "bg"; key: string }): ColorSlot {
  return {
    id: `${partial.section}/${partial.field}/${partial.role}/1@0`,
    start: 0,
    end: partial.key.length,
    ...partial,
  };
}

describe("groupSlots", () => {
  test("returns empty list for empty input", () => {
    expect(groupSlots([])).toEqual([]);
  });

  test("collapses fg/bg into a single group per (section, field)", () => {
    const slots: ColorSlot[] = [
      slot({ section: "os", field: "style", role: "bg", key: "color1" }),
      slot({ section: "os", field: "style", role: "fg", key: "color2" }),
    ];
    const groups = groupSlots(slots);
    expect(groups.length).toBe(1);
    expect(groups[0]?.section).toBe("os");
    expect(groups[0]?.field).toBe("style");
    expect(groups[0]?.bg?.key).toBe("color1");
    expect(groups[0]?.fg?.key).toBe("color2");
  });

  test("preserves first-seen order across multiple (section, field) pairs", () => {
    const slots: ColorSlot[] = [
      slot({ section: "directory", field: "style", role: "fg", key: "color1" }),
      slot({ section: "git_branch", field: "style", role: "fg", key: "color2" }),
      slot({ section: "directory", field: "style", role: "bg", key: "color3" }),
    ];
    const groups = groupSlots(slots);
    expect(groups.map(g => g.section)).toEqual(["directory", "git_branch"]);
  });
});

describe("orderByPrompt", () => {
  test("returns empty active/inactive for empty groups", () => {
    expect(orderByPrompt([], [])).toEqual({ active: [], inactive: [] });
  });

  test("single section appearing in formatTokens goes to active", () => {
    const groups = groupSlots([
      slot({ section: "os", field: "style", role: "fg", key: "color1" }),
    ]);
    const tokens: FormatToken[] = [{ type: "module", name: "os" }];
    const { active, inactive } = orderByPrompt(groups, tokens);
    expect(active.length).toBe(1);
    expect(active[0]?.section).toBe("os");
    expect(inactive).toEqual([]);
  });

  test("duplicate $module references dedupe (group appears once)", () => {
    const groups = groupSlots([
      slot({ section: "os", field: "style", role: "fg", key: "color1" }),
    ]);
    const tokens: FormatToken[] = [
      { type: "module", name: "os" },
      { type: "module", name: "os" },
    ];
    const { active } = orderByPrompt(groups, tokens);
    expect(active.length).toBe(1);
  });

  test("slots whose section never appears in formatTokens go to inactive", () => {
    const groups = groupSlots([
      slot({ section: "os", field: "style", role: "fg", key: "color1" }),
      slot({ section: "ghost", field: "style", role: "fg", key: "color2" }),
    ]);
    const tokens: FormatToken[] = [{ type: "module", name: "os" }];
    const { active, inactive } = orderByPrompt(groups, tokens);
    expect(active.map(g => g.section)).toEqual(["os"]);
    expect(inactive.map(g => g.section)).toEqual(["ghost"]);
  });

  test("transitions pull format-section groups in order", () => {
    const groups = groupSlots([
      slot({ section: "format", field: "format (#1)", role: "fg", key: "color1" }),
      slot({ section: "format", field: "format (#2)", role: "fg", key: "color2" }),
    ]);
    const tokens: FormatToken[] = [
      { type: "transition" },
      { type: "transition" },
    ];
    const { active } = orderByPrompt(groups, tokens);
    expect(active.map(g => g.field)).toEqual(["format (#1)", "format (#2)"]);
  });
});
