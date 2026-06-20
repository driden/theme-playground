import { useEffect, useState } from "react";
import type { FormatToken } from "@playground/lib/format-tokens";
import { groupSlots, orderByPrompt, type Group } from "@playground/lib/groups";
import { PalettePicker } from "./PalettePicker";
import { type ColorSlot, type Palette, type SlotRole, isPaletteRole } from "@playground/lib/types";

export type { Group } from "@playground/lib/groups";

type Props = {
  slots: ColorSlot[];
  palette: Palette;
  formatTokens: FormatToken[];
  onEdit: (slotId: string, newKey: string) => void;
  onSlotDisappeared: () => void;
  onHoverSlot: (hover: { hex: string; role: SlotRole } | null) => void;
};

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
    const hex = ((isPaletteRole(lowerKey) ? palette[lowerKey] : undefined) ?? "#000").toUpperCase();
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
