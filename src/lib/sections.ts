import { groupSlots, orderByPrompt, type Group } from "./groups";
import { isContentSection, type SectionConfig, type ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

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
  const entry = config.find(candidate => candidate.name === sectionName);
  if (!entry) return [];

  if (isContentSection(entry)) {
    // A module's visible background is whatever bg its format string actually
    // paints: the inner `[...](bg:…)` bracket when it has one (e.g. git_branch),
    // otherwise its `style` bg. Target every bg slot in the module so the whole
    // segment moves to one color — editing only `style` leaves the inner bracket
    // (the bg that's actually rendered) untouched.
    return colorSlots.filter(slot => entry.modules.includes(slot.section) && slot.role === "bg");
  }

  const separatorIndex = config
    .filter(candidate => !isContentSection(candidate))
    .findIndex(candidate => candidate.name === sectionName);

  const groups = groupSlots(colorSlots);
  const { active: orderedGroups } = orderByPrompt(groups, formatTokens);
  const runs = buildSeparatorRuns(orderedGroups, config);
  const run = runs[separatorIndex];
  if (!run) return [];

  return run.flatMap(group => (group.fg ? [group.fg] : []));
}
