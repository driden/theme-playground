type Props = { palette: Record<string, string> };

const GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: "chrome", keys: [
    "background", "foreground", "cursor",
    "selection_background", "selection_foreground",
  ]},
  { label: "syntax", keys: [
    "comment", "keyword", "string", "function", "type",
    "number", "variable", "constant", "operator", "property", "parameter",
  ]},
  { label: "diagnostics", keys: ["error", "warning", "info", "hint"] },
];

export function PaletteLegend({ palette }: Props) {
  return (
    <div className="palette-legend">
      {GROUPS.map(g => {
        const present = g.keys.filter(k => palette[k]);
        if (present.length === 0) return null;
        return (
          <div key={g.label} className="legend-group">
            <h3>{g.label}</h3>
            <div className="legend-rows">
              {present.map(k => {
                const hex = palette[k] ?? "";
                return (
                  <div key={k} className="legend-row">
                    <span className="swatch inline" style={{ background: hex }} />
                    <span className="legend-name">{k}</span>
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
