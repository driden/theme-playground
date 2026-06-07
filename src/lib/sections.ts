import { groupSlots, orderByPrompt, type Group } from "./groups";
import { isContentSection, type SectionConfig, type ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

export function isStyleField(field: string): boolean {
  return field === "style" || field.endsWith("_style") || field.startsWith("style_");
}

// Collects consecutive runs of format-section groups that appear after the
// first content-section group. Each run corresponds (in order) to a separator
// entry in the config.
export function buildSeparatorRuns(orderedGroups: Group[], config: SectionConfig): Group[][] {
  const allModules = new Set(
    config.flatMap(entry => (isContentSection(entry) ? entry.modules : [])),
  );
  const runs: Group[][] = [];
  let currentRun: Group[] | null = null;
  let seenFirstContent = false;

  for (const group of orderedGroups) {
    if (allModules.has(group.section)) {
      seenFirstContent = true;
      currentRun = null;
    } else if (group.section === "format" && seenFirstContent) {
      if (currentRun === null) {
        currentRun = [];
        runs.push(currentRun);
      }
      currentRun.push(group);
    } else {
      currentRun = null;
    }
  }

  return runs;
}

export function resolveSection(
  sectionName: string,
  config: SectionConfig,
  colorSlots: ColorSlot[],
  formatTokens: FormatToken[],
): ColorSlot[] {
  const entry = config.find(e => e.name === sectionName);
  if (!entry) return [];

  if (isContentSection(entry)) {
    return colorSlots.filter(
      slot =>
        entry.modules.includes(slot.section) && slot.role === "bg" && isStyleField(slot.field),
    );
  }

  const separatorIndex = config
    .filter(e => !isContentSection(e))
    .findIndex(e => e.name === sectionName);

  const groups = groupSlots(colorSlots);
  const { active: orderedGroups } = orderByPrompt(groups, formatTokens);
  const runs = buildSeparatorRuns(orderedGroups, config);
  const run = runs[separatorIndex];
  if (!run) return [];

  return run.flatMap(group => (group.fg ? [group.fg] : []));
}
