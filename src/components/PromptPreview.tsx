import { useMemo } from "react";
import { AnsiUp } from "ansi_up";
import type { SlotRole } from "../lib/slot-discovery";

type Props = {
  ansi: string | null;
  highlight: { hex: string; role: SlotRole } | null;
};

// These regexes are coupled to ansi_up's output shape: it emits spans like
// `<span style="color:rgb(R, G, B);background-color:rgb(R, G, B)">…</span>`.
// If ansi_up's emitted markup changes, both the regex and annotateSpans need
// updating.
const RGB_FG_RE = /(?:^|;)\s*color\s*:\s*rgb\(([^)]+)\)/;
const RGB_BG_RE = /(?:^|;)\s*background-color\s*:\s*rgb\(([^)]+)\)/;

function rgbToHex(triple: string): string | null {
  const parts = triple.split(",");
  if (parts.length !== 3) return null;
  const nums: number[] = [];
  for (const part of parts) {
    const n = parseInt(part.trim(), 10);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    nums.push(n);
  }
  return (
    "#" +
    nums
      .map(n => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

function hexAttr(style: string, re: RegExp, attrName: string): string | null {
  const match = re.exec(style);
  const hex = match?.[1] ? rgbToHex(match[1]) : null;
  return hex ? `${attrName}="${hex}"` : null;
}

function annotateSpans(html: string): string {
  return html.replace(/<span style="([^"]*)">/g, (_match, style: string) => {
    const attrs = [
      hexAttr(style, RGB_FG_RE, "data-fg"),
      hexAttr(style, RGB_BG_RE, "data-bg"),
    ].filter((attr): attr is string => attr !== null);
    return `<span style="${style}" ${attrs.join(" ")}>`;
  });
}

export function PromptPreview({ ansi, highlight }: Props) {
  const html = useMemo(() => {
    if (!ansi) return "(no preview)";
    const ansi_up = new AnsiUp();
    ansi_up.use_classes = false;
    return annotateSpans(ansi_up.ansi_to_html(ansi));
  }, [ansi]);

  // Dynamic CSS rule: highlight spans whose role-matching channel uses this hex.
  const highlightCss = useMemo(() => {
    if (!highlight) return "";
    const attr = highlight.role === "fg" ? "data-fg" : "data-bg";
    return `.prompt-preview span[${attr}="${highlight.hex.toUpperCase()}"] {
      outline: 2px solid #fff;
      outline-offset: -1px;
      filter: brightness(1.15);
    }`;
  }, [highlight]);

  return (
    <>
      {highlightCss && <style>{highlightCss}</style>}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: rendering ansi_up's HTML output, which sanitizes its input */}
      <pre className="prompt-preview" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
