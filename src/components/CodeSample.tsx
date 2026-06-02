import { Fragment, useMemo, type ReactNode } from "react";

type Props = { palette: Record<string, string> };

// Roles the sample actually references. If any is missing the theme hasn't
// been re-extracted under the semantic schema yet — fall back to a message.
const REQUIRED = [
  "background", "foreground",
  "comment", "keyword", "string", "function", "type",
  "number", "variable", "constant", "operator", "property", "parameter",
  "error", "warning", "info", "hint",
];

type Line = ReactNode[] | ReactNode;

function buildLines(p: Record<string, string>): Line[] {
  const s = (role: string, text: string): ReactNode => (
    <span style={{ color: p[role] }}>{text}</span>
  );

  return [
    s("comment", "-- factorial of n; tail-recursive via accumulator"),
    [s("keyword","local"), " ", s("function","factorial"), " ", s("operator","="), " ", s("keyword","function"), "(", s("parameter","n"), ", ", s("parameter","acc"), ")"],
    ["  ", s("keyword","if"), " ", s("parameter","n"), " ", s("operator","<="), " ", s("number","1"), " ", s("keyword","then"), " ", s("keyword","return"), " ", s("parameter","acc"), " ", s("operator","or"), " ", s("number","1"), " ", s("keyword","end")],
    ["  ", s("keyword","return"), " ", s("function","factorial"), "(", s("parameter","n"), " ", s("operator","-"), " ", s("number","1"), ", (", s("parameter","acc"), " ", s("operator","or"), " ", s("number","1"), ") ", s("operator","*"), " ", s("parameter","n"), ")"],
    s("keyword","end"),
    "",
    s("comment", "-- usage"),
    [s("keyword","local"), " ", s("variable","msg"), " ", s("operator","="), " ", s("string",'"6! = "'), " ", s("operator",".."), " ", s("function","tostring"), "(", s("function","factorial"), "(", s("number","6"), "))"],
    [s("variable","vim"), ".", s("property","notify"), "(", s("variable","msg"), ", ", s("variable","vim"), ".", s("property","log"), ".", s("property","levels"), ".", s("constant","INFO"), ")"],
    "",
    [s("error","DiagnosticError"), "  ", s("warning","DiagnosticWarn"), "  ", s("info","DiagnosticInfo"), "  ", s("hint","DiagnosticHint")],
  ];
}

export function CodeSample({ palette }: Props) {
  const missing = REQUIRED.filter(r => !palette[r]);
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
      style={{ background: palette.background, color: palette.foreground }}
    >
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </pre>
  );
}
