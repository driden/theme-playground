import { assertNonNull } from "./assert";
import type { ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

export type Group = {
  section: string;
  field: string;
  fg?: ColorSlot;
  bg?: ColorSlot;
};

// One Group per (section, field). Slots arrive interleaved by role; collapse
// them so we render one row per pair.
export function groupSlots(slots: ColorSlot[]): Group[] {
  const map = new Map<string, Group>();
  for (const slot of slots) {
    const key = `${slot.section}/${slot.field}`;
    const group = map.get(key) ?? { section: slot.section, field: slot.field };
    if (slot.role === "fg") group.fg = slot;
    else group.bg = slot;
    map.set(key, group);
  }
  return [...map.values()];
}

// Order `groups` to match the visual order of the rendered prompt by walking
// `formatTokens`: each transition pulls the next format-section group; each
// module reference pulls all that section's groups. Anything left over is
// "defined but unused".
export function orderByPrompt(
  groups: Group[],
  formatTokens: FormatToken[],
): { active: Group[]; inactive: Group[] } {
  const bySection = new Map<string, Group[]>();
  for (const group of groups) {
    const arr = bySection.get(group.section) ?? [];
    arr.push(group);
    bySection.set(group.section, arr);
  }
  const formatQueue = [...(bySection.get("format") ?? [])];
  const active: Group[] = [];
  const seen = new Set<string>();
  const keyOf = (group: Group) => `${group.section}/${group.field}`;

  for (const token of formatTokens) {
    if (token.type === "transition") {
      const group = formatQueue.shift();
      assertNonNull(group, "orderByPrompt: transition with no remaining formatGroup");
      active.push(group);
      seen.add(keyOf(group));
    } else {
      for (const group of bySection.get(token.name) ?? []) {
        if (!seen.has(keyOf(group))) {
          active.push(group);
          seen.add(keyOf(group));
        }
      }
    }
  }
  // More format groups than transitions — anything left is still active.
  for (const group of formatQueue) {
    active.push(group);
    seen.add(keyOf(group));
  }

  const inactive = groups.filter(group => !seen.has(keyOf(group)));
  return { active, inactive };
}
