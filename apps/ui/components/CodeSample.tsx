// biome-ignore-all format: each inner array represents one visual line of the
// rendered sample — keeping tokens packed per line is more readable than
// one-token-per-line. Format opts out for this file only.
import { Fragment, useMemo, type ReactNode } from "react";
import type { Palette } from "../lib/types";

type Props = { palette: Palette; font: string };

// Roles the sample actually references. If any is missing the theme hasn't
// been re-extracted under the semantic schema yet — fall back to a message.
const REQUIRED: Array<keyof Palette> = [
  "background", "foreground",
  "comment", "keyword", "string", "function", "type",
  "number", "variable", "constant", "operator", "property", "parameter",
  "error", "warning", "info", "hint",
];

type Line = ReactNode[] | ReactNode;

function buildLines(palette: Palette): Line[] {
  const span = (role: keyof Palette, text: string): ReactNode => (
    <span style={{ color: palette[role] }}>{text}</span>
  );

  return [
    span("comment", "-- factorial of n; tail-recursive via accumulator"),
    [span("keyword","local"), " ", span("function","factorial"), " ", span("operator","="), " ", span("keyword","function"), "(", span("parameter","n"), ", ", span("parameter","acc"), ")"],
    ["  ", span("keyword","if"), " ", span("parameter","n"), " ", span("operator","<="), " ", span("number","1"), " ", span("keyword","then"), " ", span("keyword","return"), " ", span("parameter","acc"), " ", span("operator","or"), " ", span("number","1"), " ", span("keyword","end")],
    ["  ", span("keyword","return"), " ", span("function","factorial"), "(", span("parameter","n"), " ", span("operator","-"), " ", span("number","1"), ", (", span("parameter","acc"), " ", span("operator","or"), " ", span("number","1"), ") ", span("operator","*"), " ", span("parameter","n"), ")"],
    span("keyword","end"),
    "",
    span("comment", "-- usage"),
    [span("keyword","local"), " ", span("variable","msg"), " ", span("operator","="), " ", span("string",'"6! = "'), " ", span("operator",".."), " ", span("function","tostring"), "(", span("function","factorial"), "(", span("number","6"), "))"],
    [span("variable","vim"), ".", span("property","notify"), "(", span("variable","msg"), ", ", span("variable","vim"), ".", span("property","log"), ".", span("property","levels"), ".", span("constant","INFO"), ")"],
    "",
    [span("error","DiagnosticError"), "  ", span("warning","DiagnosticWarn"), "  ", span("info","DiagnosticInfo"), "  ", span("hint","DiagnosticHint")],
  ];
}

export function CodeSample({ palette, font }: Props) {
  const missing = REQUIRED.filter(role => !palette[role]);
  const lines = useMemo(() => missing.length ? null : buildLines(palette), [palette, missing.length]);

  if (lines === null) {
    return (
      <div className="code-sample-missing">
        Code sample needs semantic roles in <code>colors.toml</code> (<code>{missing.slice(0, 3).join(", ")}{missing.length > 3 ? ", …" : ""}</code>).
        Re-run <code>theme extract</code> against this theme to enable it.
      </div>
    );
  }
  return (
    <pre
      className="code-sample"
      style={{ background: palette.background, color: palette.foreground, fontFamily: font }}
    >
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lines is a static literal that never reorders
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </pre>
  );
}
