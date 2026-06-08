import { groupSlots, orderByPrompt, type Group } from "./groups";
import type { SectionConfig, ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

export type SectionStripe = { name: string; color: string | null; slots: ColorSlot[] };

type Stripe = { color: string | null; slots: ColorSlot[] };

// A powerline prompt renders as a chain of colored stripes. Each content module
// contributes its background as a stripe; between two modules the transition
// glyphs introduce an intermediate stripe (a separator). Crucially every
// transition glyph spans two stripes — its fg is the stripe to its left, its bg
// the stripe to its right — so one stripe's color appears on a module background
// AND on the bordering glyph edges (the os color paints the leading arrow, the
// os segment, and the arrow leaving it). Walking the prompt in order and cutting
// a new stripe at each transition bg reconstructs the chain; the stripes line up
// 1:1, in order, with the config's section entries.
function buildStripes(orderedGroups: Group[]): Stripe[] {
  let current: Stripe = { color: null, slots: [] };
  const stripes: Stripe[] = [current];

  for (const group of orderedGroups) {
    if (group.section === "format") {
      if (group.fg) {
        current.color ??= group.fg.key;
        current.slots.push(group.fg);
      }
      if (group.bg) {
        current = { color: group.bg.key, slots: [group.bg] };
        stripes.push(current);
      }
    } else if (group.bg) {
      // A module's visible background continues the current stripe; any other bg
      // it carries (e.g. a `style` bg the format string paints over) won't match
      // the chain color and is left alone.
      current.color ??= group.bg.key;
      if (group.bg.key === current.color) current.slots.push(group.bg);
    }
  }

  return stripes;
}

// Maps the config's section entries, in order, onto the prompt's stripe chain.
export function sectionStripes(
  config: SectionConfig,
  colorSlots: ColorSlot[],
  formatTokens: FormatToken[],
): SectionStripe[] {
  const groups = groupSlots(colorSlots);
  const { active } = orderByPrompt(groups, formatTokens);
  const stripes = buildStripes(active);
  return config.map((entry, i) => {
    const stripe = stripes[i];
    return { name: entry.name, color: stripe?.color ?? null, slots: stripe?.slots ?? [] };
  });
}

export function resolveSection(
  sectionName: string,
  config: SectionConfig,
  colorSlots: ColorSlot[],
  formatTokens: FormatToken[],
): ColorSlot[] {
  const stripe = sectionStripes(config, colorSlots, formatTokens).find(
    candidate => candidate.name === sectionName,
  );
  return stripe?.slots ?? [];
}
