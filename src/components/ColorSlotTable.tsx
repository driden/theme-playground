import { useEffect, useState } from "react";
import { isSemanticRole, type ColorSlot, type SlotRole, type Palette } from "../lib/types";
import { assertNonNull } from "../lib/assert";
import type { FormatToken } from "../lib/format-tokens";
import { PalettePicker } from "./PalettePicker";

type Props = {
  slots: ColorSlot[];
  palette: Palette;
  formatTokens: FormatToken[];
  onEdit: (slotId: string, newKey: string) => void;
  onSlotDisappeared: () => void;
  onHoverSlot: (hover: { hex: string; role: SlotRole } | null) => void;
};

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

export function ColorSlotTable({
  slots,
  palette,
  formatTokens,
  onEdit,
  onSlotDisappeared,
  onHoverSlot,
}: Props) {
  const [openSlotId, setOpenSlotId] = useState<string | null>(null);

  useEffect(() => {
    if (openSlotId && !slots.find(slot => slot.id === openSlotId)) {
      setOpenSlotId(null);
      onSlotDisappeared();
    }
  }, [slots, openSlotId, onSlotDisappeared]);

  const groups = groupSlots(slots);
  const { active: activeGroups, inactive: inactiveGroups } = orderByPrompt(groups, formatTokens);

  function renderCell(slot?: ColorSlot) {
    if (!slot) return <span className="empty-cell">—</span>;
    const lowerKey = slot.key.toLowerCase();
    const hex = (
      (isSemanticRole(lowerKey) ? palette[lowerKey] : undefined) ?? "#000"
    ).toUpperCase();
    return (
      <span
        className="slot-cell"
        onMouseEnter={() => onHoverSlot({ hex, role: slot.role })}
        onMouseLeave={() => onHoverSlot(null)}
      >
        <span
          className="swatch inline clickable"
          style={{ background: hex }}
          onClick={() => setOpenSlotId(slot.id)}
          title="click to pick a new color"
        />
        <span className="slot-key">{slot.key}</span>
        {openSlotId === slot.id && (
          <PalettePicker
            palette={palette}
            onPick={key => {
              onEdit(slot.id, key);
              setOpenSlotId(null);
            }}
            onClose={() => setOpenSlotId(null)}
          />
        )}
      </span>
    );
  }

  function renderRow(group: Group, key: string) {
    return (
      <tr key={key}>
        <td>{group.section}</td>
        <td>{group.field}</td>
        <td>{renderCell(group.bg)}</td>
        <td>{renderCell(group.fg)}</td>
      </tr>
    );
  }

  function renderGroup(label: string, items: Group[], prefix: string) {
    if (items.length === 0) return null;
    return (
      <>
        <tr className="group-header">
          <td colSpan={4}>{label}</td>
        </tr>
        {items.map((item, i) => renderRow(item, `${prefix}${i}`))}
      </>
    );
  }

  return (
    <table className="slot-table">
      <thead>
        <tr>
          <th>Section</th>
          <th>Field</th>
          <th>BG</th>
          <th>FG</th>
        </tr>
      </thead>
      <tbody>
        {renderGroup("in your prompt", activeGroups, "a")}
        {renderGroup("defined but unused", inactiveGroups, "i")}
      </tbody>
    </table>
  );
}
