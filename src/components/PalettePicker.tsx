type Props = {
  palette: Record<string, string>;
  onPick: (key: string) => void;
  onClose: () => void;
};

const ORDER = [
  // chrome (semantic + X11 share these)
  "background", "foreground", "cursor",
  "selection_background", "selection_foreground",
  // syntax (semantic schema)
  "comment", "keyword", "string", "function", "type",
  "number", "variable", "constant", "operator", "property", "parameter",
  // diagnostics
  "error", "warning", "info", "hint",
  // X11 (legacy schema)
  "accent",
  "color0", "color1", "color2", "color3", "color4", "color5", "color6", "color7",
  "color8", "color9", "color10", "color11", "color12", "color13", "color14", "color15",
];

export function PalettePicker({ palette, onPick, onClose }: Props) {
  // Known keys first in stable order, then any palette keys not in ORDER (e.g.
  // theme-specific names like bamboo's `lavender` / `teal`).
  const known = ORDER.filter(k => palette[k]);
  const extras = Object.keys(palette).filter(k => !ORDER.includes(k));
  const present = [...known, ...extras];
  return (
    <div className="picker-popover" onMouseLeave={onClose}>
      <div className="palette-strip">
        {present.map(key => (
          <div
            key={key}
            className="swatch"
            style={{ background: palette[key] }}
            title={`${key} — ${palette[key]}`}
            onClick={() => onPick(key)}
          />
        ))}
      </div>
    </div>
  );
}
