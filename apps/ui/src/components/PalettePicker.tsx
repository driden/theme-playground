import type { Palette } from "@playground/lib/types";

type Props = {
    palette: Palette;
    onPick: (key: string) => void;
    onClose: () => void;
};

export function PalettePicker({ palette, onPick, onClose }: Props) {
    return (
        <div className="picker-popover" onMouseLeave={onClose}>
            <div className="palette-strip">
                {Object.entries(palette).map(([key, hex]) => (
                    <div
                        key={key}
                        className="swatch"
                        style={{ background: hex }}
                        title={`${key} — ${hex}`}
                        onClick={() => onPick(key)}
                    />
                ))}
            </div>
        </div>
    );
}
