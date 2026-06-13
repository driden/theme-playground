import { useMemo, useState } from "react";
import { isPaletteRole, type Palette, type SectionConfig, type AppState } from "../lib/types";
import { sectionStripes } from "../lib/sections";
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

  const stripes = useMemo(
    () => sectionStripes(config, app.colorSlots, parseFormatTokens(app.fileRaw)),
    [config, app.colorSlots, app.fileRaw],
  );

  function hexOf(role: string | null): string | null {
    if (role === null) return null;
    const lower = role.toLowerCase();
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
        {config.map((entry, i) => {
          const hex = hexOf(stripes[i]?.color ?? null);
          return (
            <tr key={entry.name}>
              <td>{entry.name}</td>
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
