import { useMemo, useState } from "react";
import {
  isPaletteRole,
  isContentSection,
  type Palette,
  type SectionConfig,
  type AppState,
} from "../lib/types";
import { groupSlots, orderByPrompt } from "../lib/groups";
import { buildSeparatorRuns } from "../lib/sections";
import { parseFormatTokens } from "../lib/format-tokens";
import { PalettePicker } from "./PalettePicker";

type Props = {
  config: SectionConfig;
  app: AppState;
  palette: Palette;
  onEditSection: (sectionName: string, newKey: string) => void;
};

export function SectionsTable({ config, app, palette, onEditSection }: Props) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const separatorRuns = useMemo(() => {
    const groups = groupSlots(app.colorSlots);
    const tokens = parseFormatTokens(app.fileRaw);
    const { active } = orderByPrompt(groups, tokens);
    return buildSeparatorRuns(active, config);
  }, [app.colorSlots, app.fileRaw, config]);

  function sectionColor(sectionName: string): string | null {
    const entry = config.find(candidate => candidate.name === sectionName);
    if (!entry) return null;

    if (isContentSection(entry)) {
      const moduleBgs = app.colorSlots.filter(
        candidate => entry.modules.includes(candidate.section) && candidate.role === "bg",
      );
      // Show the bg that's actually rendered: the inner format bracket when the
      // module has one, otherwise its style bg.
      const slot =
        moduleBgs.find(candidate => candidate.field.startsWith("format")) ?? moduleBgs[0];
      if (!slot) return null;
      const lower = slot.key.toLowerCase();
      return (isPaletteRole(lower) ? palette[lower] : undefined) ?? null;
    }

    const sepIndex = config
      .filter(candidate => !isContentSection(candidate))
      .findIndex(candidate => candidate.name === sectionName);
    const firstSlot = separatorRuns[sepIndex]?.[0]?.fg;
    if (!firstSlot) return null;
    const lower = firstSlot.key.toLowerCase();
    return (isPaletteRole(lower) ? palette[lower] : undefined) ?? null;
  }

  return (
    <table className="slot-table sections-table">
      <thead>
        <tr>
          <th>Section</th>
          <th>Color</th>
        </tr>
      </thead>
      <tbody>
        {config.map(entry => {
          const isSep = !isContentSection(entry);
          const hex = sectionColor(entry.name);
          return (
            <tr key={entry.name} className={isSep ? "separator-row" : "content-row"}>
              <td>{isSep ? `↳ ${entry.name}` : entry.name}</td>
              <td>
                {hex !== null ? (
                  <span className="slot-cell">
                    <span
                      className="swatch inline clickable"
                      style={{ background: hex }}
                      onClick={() => setOpenSection(entry.name)}
                      title="click to pick a new color"
                    />
                    {openSection === entry.name && (
                      <PalettePicker
                        palette={palette}
                        onPick={key => {
                          onEditSection(entry.name, key);
                          setOpenSection(null);
                        }}
                        onClose={() => setOpenSection(null)}
                      />
                    )}
                  </span>
                ) : (
                  <span className="empty-cell">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
