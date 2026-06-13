import { describe, expect, test } from "bun:test";
import { parseFormatTokens } from "../src/format-tokens";

describe("parseFormatTokens", () => {
  test("triple-quoted format with transitions and modules", () => {
    // biome-ignore format: one-line-per-element mirrors the multiline format intent
    const text = [
      `format = """`,
      `[](fg:color1)\\`,
      `$os\\`,
      `$directory\\`,
      `"""`,
    ].join("\n");
    expect(parseFormatTokens(text)).toEqual([
      { type: "transition" },
      { type: "module", name: "os" },
      { type: "module", name: "directory" },
    ]);
  });

  test("single-quoted single-line format", () => {
    const text = `format = '$os$directory'\n`;
    expect(parseFormatTokens(text)).toEqual([
      { type: "module", name: "os" },
      { type: "module", name: "directory" },
    ]);
  });

  test("double-quoted single-line format", () => {
    const text = `format = "$os$directory"\n`;
    expect(parseFormatTokens(text)).toEqual([
      { type: "module", name: "os" },
      { type: "module", name: "directory" },
    ]);
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: ${env_var} / ${USER} are literals describing starship's brace syntax, not real template expressions
  test("braced ${env_var} module references", () => {
    const text = `format = "\${USER}$os"\n`;
    expect(parseFormatTokens(text)).toEqual([
      { type: "module", name: "USER" },
      { type: "module", name: "os" },
    ]);
  });

  test("bare $env_var module references", () => {
    const text = `format = "$USER$os"\n`;
    expect(parseFormatTokens(text)).toEqual([
      { type: "module", name: "USER" },
      { type: "module", name: "os" },
    ]);
  });

  test("missing `format =` returns empty list", () => {
    expect(parseFormatTokens(`[directory]\nstyle = "fg:color1"\n`)).toEqual([]);
  });

  test("strips #-prefixed comment lines inside format body", () => {
    // biome-ignore format: one-line-per-element mirrors the multiline format intent
    const text = [
      `format = """`,
      `#$python\\`,
      `$os\\`,
      `"""`,
    ].join("\n");
    expect(parseFormatTokens(text)).toEqual([{ type: "module", name: "os" }]);
  });

  test("captures transition between modules: ](style)", () => {
    const text = "format = '[ $branch ](fg:color1 bg:color2)$style'\n";
    const tokens = parseFormatTokens(text);
    expect(tokens).toEqual([
      { type: "module", name: "branch" },
      { type: "transition" },
      { type: "module", name: "style" },
    ]);
  });
});
