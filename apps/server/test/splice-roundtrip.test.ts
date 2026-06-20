import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { discoverSlots, paletteKeysFromStarshipToml } from "../src/slot-discovery";

describe("slot splice byte-roundtrip", () => {
  const tomlPath = path.join(__dirname, "fixtures", "themes", "bamboo", "starship.toml");
  const text = fs.readFileSync(tomlPath, "utf8");
  const palette = paletteKeysFromStarshipToml(text);
  const slots = discoverSlots(text, palette, "name-token");

  test("fixture has enough slots to pick a middle one", () => {
    expect(slots.length).toBeGreaterThan(2);
  });

  test("splicing a middle slot leaves bytes before/after byte-identical", () => {
    const slot = slots[Math.floor(slots.length / 2)];
    if (!slot) throw new Error("expected a middle slot");
    const newKey = "background"; // a valid palette key in bamboo
    const next = text.slice(0, slot.start) + newKey + text.slice(slot.end);

    expect(next.slice(0, slot.start)).toBe(text.slice(0, slot.start));
    expect(next.slice(slot.start + newKey.length)).toBe(text.slice(slot.end));
  });

  test("new text differs only at the spliced region", () => {
    const slot = slots[Math.floor(slots.length / 2)];
    if (!slot) throw new Error("expected a middle slot");
    const oldKey = slot.key;
    const newKey = oldKey === "background" ? "foreground" : "background";
    const next = text.slice(0, slot.start) + newKey + text.slice(slot.end);

    const oldRegion = text.slice(slot.start, slot.end);
    const newRegion = next.slice(slot.start, slot.start + newKey.length);
    expect(oldRegion).toBe(oldKey);
    expect(newRegion).toBe(newKey);
    expect(next.length).toBe(text.length - oldKey.length + newKey.length);
  });

  test("comments and structural lines are untouched after splice", () => {
    const slot = slots[Math.floor(slots.length / 2)];
    if (!slot) throw new Error("expected a middle slot");
    const newKey = "background";
    const next = text.slice(0, slot.start) + newKey + text.slice(slot.end);

    // Comment lines from the bamboo fixture that should survive a splice.
    const commentLines = [
      "#$c\\",
      "#$rust\\",
      "#$golang\\",
      "command_timeout=100",
      `"$schema" = 'https://starship.rs/config-schema.json'`,
    ];
    for (const line of commentLines) {
      expect(text.includes(line)).toBe(true);
      expect(next.includes(line)).toBe(true);
    }
  });
});
