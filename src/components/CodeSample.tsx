import { useMemo } from "react";

type Props = { palette: Record<string, string> };

// Roles the sample actually references. If any is missing the theme hasn't
// been re-extracted under the semantic schema yet — fall back to a message.
const REQUIRED = [
  "background", "foreground",
  "comment", "keyword", "string", "function", "type",
  "number", "variable", "constant", "operator", "property", "parameter",
  "error", "warning", "info", "hint",
];

function buildHtml(p: Record<string, string>): string {
  const span = (role: string, text: string) =>
    `<span style="color:${p[role]}">${escape(text)}</span>`;

  return [
    span("comment", "-- factorial of n; tail-recursive via accumulator"),
    `${span("keyword","local")} ${span("function","factorial")} ${span("operator","=")} ${span("keyword","function")}(${span("parameter","n")}, ${span("parameter","acc")})`,
    `  ${span("keyword","if")} ${span("parameter","n")} ${span("operator","<=")} ${span("number","1")} ${span("keyword","then")} ${span("keyword","return")} ${span("parameter","acc")} ${span("operator","or")} ${span("number","1")} ${span("keyword","end")}`,
    `  ${span("keyword","return")} ${span("function","factorial")}(${span("parameter","n")} ${span("operator","-")} ${span("number","1")}, (${span("parameter","acc")} ${span("operator","or")} ${span("number","1")}) ${span("operator","*")} ${span("parameter","n")})`,
    `${span("keyword","end")}`,
    "",
    span("comment", "-- usage"),
    `${span("keyword","local")} ${span("variable","msg")} ${span("operator","=")} ${span("string",'"6! = "')} ${span("operator","..")} ${span("function","tostring")}(${span("function","factorial")}(${span("number","6")}))`,
    `${span("variable","vim")}.${span("property","notify")}(${span("variable","msg")}, ${span("variable","vim")}.${span("property","log")}.${span("property","levels")}.${span("constant","INFO")})`,
    "",
    `${span("error","DiagnosticError")}  ${span("warning","DiagnosticWarn")}  ${span("info","DiagnosticInfo")}  ${span("hint","DiagnosticHint")}`,
  ].join("\n");
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function CodeSample({ palette }: Props) {
  const missing = REQUIRED.filter(r => !palette[r]);
  const html = useMemo(() => missing.length ? null : buildHtml(palette), [palette, missing.length]);

  if (html === null) {
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
