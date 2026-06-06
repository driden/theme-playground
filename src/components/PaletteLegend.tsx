import type { Palette } from "../lib/types";

type Props = { palette: Palette };

const GROUPS: Array<{ label: string; keys: Array<keyof Palette> }> = [
  {
    label: "chrome",
    keys: ["background", "foreground", "cursor", "selection_background", "selection_foreground"],
  },
  {
    label: "syntax",
    keys: [
      "comment",
      "keyword",
      "string",
      "function",
      "type",
      "number",
      "variable",
      "constant",
      "operator",
      "property",
      "parameter",
    ],
  },
  { label: "diagnostics", keys: ["error", "warning", "info", "hint"] },
];

export function PaletteLegend({ palette }: Props) {
  return (
    <div className="palette-legend">
      {GROUPS.map(group => {
        const present = group.keys.filter(key => palette[key]);
        if (present.length === 0) return null;
        return (
          <div key={group.label} className="legend-group">
            <h3>{group.label}</h3>
            <div className="legend-rows">
              {present.map(key => {
                const hex = palette[key] ?? "";
                return (
                  <div key={key} className="legend-row">
                    <span className="swatch inline" style={{ background: hex }} />
                    <span className="legend-name">{key}</span>
                    <span className="legend-hex">{hex.toUpperCase()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
