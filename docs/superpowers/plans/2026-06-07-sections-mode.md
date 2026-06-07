# Sections Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sections mode (default) that lets the user set one color per named prompt section (os, separator1, cwd, separator2, branch, separator3, separator4), updating all constituent slots at once.

**Architecture:** A per-theme `sections.json` declares which starship modules belong to each content section; separator sections are implicit (no `modules` key). Pure helper `src/lib/sections.ts` resolves section name → target slots using the ordered prompt groups. Server applies all slot edits atomically via a new `POST /api/themes/:name/:app/section` endpoint. Frontend `SectionsTable` component renders the flat table; a toggle in `AppSection` switches between sections and slots mode.

**Tech Stack:** Bun, React 18, Zod 4, TypeScript, tree-sitter-toml (already in use)

---

### Task 1: Types, fixture, gitignore

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `.gitignore`
- Create: `test/fixtures/themes/bamboo/sections.json`

- [ ] Add `SectionEntry`, `SectionConfig`, `SectionEditBodySchema` to `src/lib/types.ts`. Insert after the existing `SlotEditBodySchema` block:

```ts
export const SectionEntrySchema = z.object({
  name: z.string().min(1),
  modules: z.array(z.string().min(1)).optional(),
});
export type SectionEntry = z.infer<typeof SectionEntrySchema>;
export type SectionConfig = SectionEntry[];
export const SectionConfigSchema = z.array(SectionEntrySchema);

export const isContentSection = (
  e: SectionEntry,
): e is SectionEntry & { modules: string[] } =>
  e.modules !== undefined && e.modules.length > 0;

export const SectionEditBodySchema = z.object({
  sectionName: z.string().min(1),
  newPaletteKey: z.string().min(1),
});
```

- [ ] Extend `ThemeStateSchema` (replace existing definition):

```ts
export const ThemeStateSchema = z.object({
  name: z.string(),
  palette: PaletteSchema,
  apps: z.array(AppStateSchema),
  sections: SectionConfigSchema.optional(),
});
export type ThemeState = z.infer<typeof ThemeStateSchema>;
```

- [ ] Create `test/fixtures/themes/bamboo/sections.json`:

```json
[
  { "name": "os", "modules": ["os", "username"] },
  { "name": "separator1" },
  { "name": "cwd", "modules": ["directory"] },
  { "name": "separator2" },
  { "name": "branch", "modules": ["git_branch", "git_status"] },
  { "name": "separator3" },
  { "name": "separator4" }
]
```

- [ ] Add `.superpowers/` to `.gitignore` (the brainstorming server wrote files there).

- [ ] Run: `bun run check` — expect clean output.

- [ ] Commit:
```bash
git add src/lib/types.ts test/fixtures/themes/bamboo/sections.json .gitignore
git commit -m "feat(sections): add SectionConfig types and bamboo fixture"
```

---

### Task 2: Move groupSlots / orderByPrompt to src/lib/groups.ts

The server needs these for section resolution. They live in a frontend component today; move them to `src/lib/` so both sides can import them.

**Files:**
- Create: `src/lib/groups.ts`
- Modify: `src/components/ColorSlotTable.tsx`
- Modify: `test/group-slots.test.ts`

- [ ] Create `src/lib/groups.ts` with the full implementations (copied verbatim from `ColorSlotTable.tsx`):

```ts
import { assertNonNull } from "./assert";
import type { ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

export type Group = {
  section: string;
  field: string;
  fg?: ColorSlot;
  bg?: ColorSlot;
};

export function groupSlots(slots: ColorSlot[]): Group[] {
  const map = new Map<string, Group>();
  for (const slot of slots) {
    const key = `${slot.section}/${slot.field}`;
    const group = map.get(key) ?? { section: slot.section, field: slot.field };
    if (slot.role === "fg") group.fg = slot;
    else group.bg = slot;
    map.set(key, group);
  }
  return [...map.values()];
}

export function orderByPrompt(
  groups: Group[],
  formatTokens: FormatToken[],
): { active: Group[]; inactive: Group[] } {
  const bySection = new Map<string, Group[]>();
  for (const group of groups) {
    const arr = bySection.get(group.section) ?? [];
    arr.push(group);
    bySection.set(group.section, arr);
  }
  const formatQueue = [...(bySection.get("format") ?? [])];
  const active: Group[] = [];
  const seen = new Set<string>();
  const keyOf = (group: Group) => `${group.section}/${group.field}`;

  for (const token of formatTokens) {
    if (token.type === "transition") {
      const group = formatQueue.shift();
      assertNonNull(group, "orderByPrompt: transition with no remaining formatGroup");
      active.push(group);
      seen.add(keyOf(group));
    } else {
      for (const group of bySection.get(token.name) ?? []) {
        if (!seen.has(keyOf(group))) {
          active.push(group);
          seen.add(keyOf(group));
        }
      }
    }
  }
  for (const group of formatQueue) {
    active.push(group);
    seen.add(keyOf(group));
  }

  const inactive = groups.filter(group => !seen.has(keyOf(group)));
  return { active, inactive };
}
```

- [ ] In `src/components/ColorSlotTable.tsx`, replace the `Group` type definition and the two function bodies with imports, and re-export `Group`:

```ts
import { groupSlots, orderByPrompt } from "../lib/groups";
export type { Group } from "../lib/groups";
```

Remove the local `Group` type, `groupSlots` function, and `orderByPrompt` function from the file.

- [ ] In `test/group-slots.test.ts`, update the import line:

```ts
import { groupSlots, orderByPrompt } from "../src/lib/groups";
```

(The `ColorSlot` and `FormatToken` imports stay on their own lines; only the function import changes.)

- [ ] Run: `bun test` — all tests pass. Run: `bun run check` — clean.

- [ ] Commit:
```bash
git add src/lib/groups.ts src/components/ColorSlotTable.tsx test/group-slots.test.ts
git commit -m "refactor: move groupSlots/orderByPrompt to src/lib/groups"
```

---

### Task 3: readSections in themes.ts

**Files:**
- Modify: `src/lib/themes.ts`

- [ ] Add the import and `readSections` function to `src/lib/themes.ts`:

```ts
import { SectionConfigSchema, type SectionConfig } from "./types";

export async function readSections(themeName: string): Promise<SectionConfig | null> {
  const sectionsPath = path.join(THEMES_DIR, themeName, "sections.json");
  const file = Bun.file(sectionsPath);
  if (!(await file.exists())) return null;
  const raw: unknown = await file.json();
  const result = SectionConfigSchema.safeParse(raw);
  if (!result.success) {
    console.warn(`sections.json for '${themeName}' is invalid: ${result.error.message}`);
    return null;
  }
  return result.data;
}
```

- [ ] Run: `bun run check` — clean.

- [ ] Commit:
```bash
git add src/lib/themes.ts
git commit -m "feat(sections): add readSections"
```

---

### Task 4: src/lib/sections.ts — resolveSection with tests

Core logic: given a section name + config + discovered slots + format tokens, return the exact `ColorSlot[]` whose value should be replaced.

- Content sections own the **BG** of all style-field slots (`style`, `style_*`, `*_style`) in their modules.
- Separator sections own the **FG** of the format bracket slots in their "run" — consecutive format-section groups that appear in prompt order after the first content section has been seen, with non-format/non-content module slots splitting the runs.

**Files:**
- Create: `test/sections.test.ts`
- Create: `src/lib/sections.ts`

- [ ] Write the failing test `test/sections.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { resolveSection } from "../src/lib/sections";
import type { ColorSlot } from "../src/lib/types";
import type { FormatToken } from "../src/lib/format-tokens";

function makeSlot(
  section: string,
  field: string,
  role: "bg" | "fg",
  key: string,
  idx = 0,
): ColorSlot {
  return {
    id: `${section}/${field}/${role}/1@${idx}`,
    section,
    field,
    role,
    key,
    start: idx,
    end: idx + key.length,
  };
}

const config = [
  { name: "os", modules: ["os", "username"] },
  { name: "sep1" },
  { name: "cwd", modules: ["directory"] },
  { name: "sep2" },
  { name: "branch", modules: ["git_branch"] },
  { name: "sep3" },
  { name: "sep4" },
];

const slots: ColorSlot[] = [
  makeSlot("format", "format (#1)", "fg", "hint", 0),
  makeSlot("os", "style", "bg", "hint", 10),
  makeSlot("os", "style", "fg", "background", 15),
  makeSlot("username", "style_user", "bg", "hint", 25),
  makeSlot("format", "format (#2)", "bg", "hint", 35),
  makeSlot("format", "format (#2)", "fg", "function", 40),
  makeSlot("format", "format (#3)", "bg", "string", 50),
  makeSlot("format", "format (#3)", "fg", "function", 55),
  makeSlot("directory", "style", "bg", "string", 65),
  makeSlot("format", "format (#4)", "bg", "string", 75),
  makeSlot("format", "format (#4)", "fg", "number", 80),
  makeSlot("format", "format (#5)", "bg", "constant", 90),
  makeSlot("format", "format (#5)", "fg", "number", 95),
  makeSlot("git_branch", "style", "bg", "constant", 105),
  makeSlot("format", "format (#6)", "bg", "type", 115),
  makeSlot("format", "format (#6)", "fg", "type", 118),
  makeSlot("docker_context", "style", "bg", "background", 125),
  makeSlot("format", "format (#7)", "fg", "function", 135),
];

const tokens: FormatToken[] = [
  { type: "transition" },
  { type: "module", name: "os" },
  { type: "module", name: "username" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "directory" },
  { type: "transition" },
  { type: "transition" },
  { type: "module", name: "git_branch" },
  { type: "transition" },
  { type: "module", name: "docker_context" },
  { type: "transition" },
];

describe("resolveSection", () => {
  test("content section returns bg slots for style fields in its modules", () => {
    const result = resolveSection("os", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "os/style/bg",
      "username/style_user/bg",
    ]);
  });

  test("separator returns fg slots of its format bracket run", () => {
    const result = resolveSection("sep1", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "format/format (#2)/fg",
      "format/format (#3)/fg",
    ]);
  });

  test("second separator maps to the correct run", () => {
    const result = resolveSection("sep2", config, slots, tokens);
    expect(result.map(s => `${s.section}/${s.field}/${s.role}`)).toEqual([
      "format/format (#4)/fg",
      "format/format (#5)/fg",
    ]);
  });

  test("trailing separators split correctly across non-content modules", () => {
    const sep3 = resolveSection("sep3", config, slots, tokens);
    expect(sep3.map(s => s.field)).toEqual(["format (#6)"]);
    const sep4 = resolveSection("sep4", config, slots, tokens);
    expect(sep4.map(s => s.field)).toEqual(["format (#7)"]);
  });

  test("returns empty array for unknown section name", () => {
    expect(resolveSection("unknown", config, slots, tokens)).toEqual([]);
  });

  test("content section ignores fg slots and non-style fields", () => {
    const result = resolveSection("branch", config, slots, tokens);
    expect(result.every(s => s.role === "bg")).toBe(true);
  });
});
```

- [ ] Run: `bun test test/sections.test.ts` — expect FAIL (module not found).

- [ ] Create `src/lib/sections.ts`:

```ts
import { groupSlots, orderByPrompt, type Group } from "./groups";
import { isContentSection, type SectionConfig, type ColorSlot } from "./types";
import type { FormatToken } from "./format-tokens";

function isStyleField(field: string): boolean {
  return field === "style" || field.endsWith("_style") || field.startsWith("style_");
}

// Collects consecutive runs of format-section groups that appear after the
// first content-section group. Each run corresponds (in order) to a separator
// entry in the config.
export function buildSeparatorRuns(
  orderedGroups: Group[],
  config: SectionConfig,
): Group[][] {
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
        entry.modules.includes(slot.section) &&
        slot.role === "bg" &&
        isStyleField(slot.field),
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
```

- [ ] Run: `bun test test/sections.test.ts` — expect PASS.

- [ ] Run: `bun test` — all tests pass.

- [ ] Commit:
```bash
git add src/lib/sections.ts test/sections.test.ts
git commit -m "feat(sections): resolveSection with tests"
```

---

### Task 5: server.ts — sections in ThemeState + section edit route

**Files:**
- Modify: `server.ts`

- [ ] Add imports at the top of `server.ts`:

```ts
import { readSections } from "./src/lib/themes";
import { resolveSection } from "./src/lib/sections";
import { parseFormatTokens } from "./src/lib/format-tokens";
import {
  isAppName,
  errMessage,
  SlotEditBodySchema,
  SectionEditBodySchema,
  type AppName,
  type AppState,
  type ColorSlot,
  type ThemeState,
} from "./src/lib/types";
```

- [ ] Replace `buildThemeState` to include sections:

```ts
async function buildThemeState(themeName: string): Promise<ThemeState> {
  const [palette, sections] = await Promise.all([
    readPalette(themeName),
    readSections(themeName),
  ]);
  return {
    name: themeName,
    palette,
    apps: [await buildAppState(themeName)],
    ...(sections !== null ? { sections } : {}),
  };
}
```

- [ ] Add the section edit route inside the `fetch` handler, **before** the existing slot-edit route (the `editCaps` block). The route regex is `/^\/api\/themes\/([\w-]+)\/([\w-]+)\/section$/`:

```ts
// POST /api/themes/:name/:app/section — atomic section-level edit
const sectionCaps = matchRoute(
  pathname,
  /^\/api\/themes\/([\w-]+)\/([\w-]+)\/section$/,
  2,
);
if (req.method === "POST" && sectionCaps) {
  const [themeName, app] = sectionCaps;
  await assertThemeExists(themeName);
  assertAppName(app);

  const parsed = SectionEditBodySchema.safeParse(await req.json());
  if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);
  const { sectionName, newPaletteKey } = parsed.data;

  const sections = await readSections(themeName);
  if (!sections) throw new HttpError(400, "this theme has no sections.json");

  const draft = await ensureDraft(themeName, app);
  const current = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(current);
  if (!palette.has(newPaletteKey.toLowerCase())) {
    throw new HttpError(
      400,
      `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`,
    );
  }

  const colorSlots = discoverSlots(current, palette, "name-token");
  const formatTokens = parseFormatTokens(current);
  const targetSlots = resolveSection(sectionName, sections, colorSlots, formatTokens);
  if (targetSlots.length === 0) {
    throw new HttpError(
      404,
      `section '${sectionName}' not found or has no editable slots`,
    );
  }

  pushHistory(themeName, app, current);
  // Apply right-to-left so earlier byte offsets remain valid after each splice.
  const sorted = [...targetSlots].sort((a, b) => b.start - a.start);
  let next = current;
  for (const slot of sorted) {
    next = next.slice(0, slot.start) + newPaletteKey + next.slice(slot.end);
  }
  await fs.writeFile(draft, next, "utf8");
  return json(await buildAppState(themeName));
}
```

- [ ] Run: `bun run check` — clean.

- [ ] Commit:
```bash
git add server.ts
git commit -m "feat(sections): server section edit endpoint + sections in ThemeState"
```

---

### Task 6: api.ts — editSection client

**Files:**
- Modify: `src/api.ts`

- [ ] Add `editSection` to `src/api.ts` (after `editSlot`):

```ts
export async function editSection(
  themeName: string,
  sectionName: string,
  newPaletteKey: string,
): Promise<AppState> {
  const res = await fetch(`/api/themes/${themeName}/starship/section`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionName, newPaletteKey }),
  });
  return parseOrThrow(res, AppStateSchema, "editSection");
}
```

- [ ] Run: `bun run check` — clean.

- [ ] Commit:
```bash
git add src/api.ts
git commit -m "feat(sections): editSection API client"
```

---

### Task 7: SectionsTable component

**Files:**
- Create: `src/components/SectionsTable.tsx`

- [ ] Create `src/components/SectionsTable.tsx`:

```tsx
import { useMemo, useState } from "react";
import {
  isPaletteRole,
  isContentSection,
  type Palette,
  type SectionConfig,
  type AppState,
} from "../lib/types";
import { groupSlots, orderByPrompt } from "../lib/groups";
import { buildSeparatorRuns } from "../lib/sections";
import { parseFormatTokens } from "../lib/format-tokens";
import { PalettePicker } from "./PalettePicker";

type Props = {
  config: SectionConfig;
  app: AppState;
  palette: Palette;
  onEditSection: (sectionName: string, newKey: string) => void;
};

function isStyleField(field: string): boolean {
  return field === "style" || field.endsWith("_style") || field.startsWith("style_");
}

export function SectionsTable({ config, app, palette, onEditSection }: Props) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const separatorRuns = useMemo(() => {
    const groups = groupSlots(app.colorSlots);
    const tokens = parseFormatTokens(app.fileRaw);
    const { active } = orderByPrompt(groups, tokens);
    return buildSeparatorRuns(active, config);
  }, [app.colorSlots, app.fileRaw, config]);

  function sectionColor(sectionName: string): string | null {
    const entry = config.find(e => e.name === sectionName);
    if (!entry) return null;

    if (isContentSection(entry)) {
      const slot = app.colorSlots.find(
        s =>
          entry.modules.includes(s.section) &&
          s.role === "bg" &&
          isStyleField(s.field),
      );
      if (!slot) return null;
      const lower = slot.key.toLowerCase();
      return (isPaletteRole(lower) ? palette[lower] : undefined) ?? null;
    }

    const sepIndex = config
      .filter(e => !isContentSection(e))
      .findIndex(e => e.name === sectionName);
    const firstSlot = separatorRuns[sepIndex]?.[0]?.fg;
    if (!firstSlot) return null;
    const lower = firstSlot.key.toLowerCase();
    return (isPaletteRole(lower) ? palette[lower] : undefined) ?? null;
  }

  return (
    <table className="slot-table sections-table">
      <thead>
        <tr>
          <th>Section</th>
          <th>Color</th>
        </tr>
      </thead>
      <tbody>
        {config.map(entry => {
          const isSep = !isContentSection(entry);
          const hex = sectionColor(entry.name);
          return (
            <tr key={entry.name} className={isSep ? "separator-row" : "content-row"}>
              <td>{isSep ? `↳ ${entry.name}` : entry.name}</td>
              <td>
                {hex !== null ? (
                  <span className="slot-cell">
                    <span
                      className="swatch inline clickable"
                      style={{ background: hex }}
                      onClick={() => setOpenSection(entry.name)}
                      title="click to pick a new color"
                    />
                    {openSection === entry.name && (
                      <PalettePicker
                        palette={palette}
                        onPick={key => {
                          onEditSection(entry.name, key);
                          setOpenSection(null);
                        }}
                        onClose={() => setOpenSection(null)}
                      />
                    )}
                  </span>
                ) : (
                  <span className="empty-cell">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] Run: `bun run check` — clean.

- [ ] Commit:
```bash
git add src/components/SectionsTable.tsx
git commit -m "feat(sections): SectionsTable component"
```

---

### Task 8: Wire up mode toggle in App.tsx + CSS

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] Add `editSection` to the import from `./api` in `src/App.tsx`.

- [ ] Add `SectionsTable` import:
```ts
import { SectionsTable } from "./components/SectionsTable";
```

- [ ] Add mode state inside the `App` component (near the other `useState` calls):
```ts
const [sectionsMode, setSectionsMode] = useState(true);
```

- [ ] Add `handleEditSection` alongside `handleEdit`:
```ts
async function handleEditSection(sectionName: string, newKey: string) {
  if (!theme) return;
  try {
    const updated = await editSection(theme.name, sectionName, newKey);
    setTheme(prev => (prev ? { ...prev, apps: [updated] } : prev));
  } catch (e: unknown) {
    setError(errMessage(e));
  }
}
```

- [ ] In the `<div className="header-actions">` block, add the toggle before the dirty marker (only shown when the theme has sections):
```tsx
{theme?.sections && (
  <span className="mode-toggle">
    <button
      type="button"
      className={sectionsMode ? "active" : ""}
      onClick={() => setSectionsMode(true)}
    >
      sections
    </button>
    <button
      type="button"
      className={sectionsMode ? "" : "active"}
      onClick={() => setSectionsMode(false)}
    >
      slots
    </button>
  </span>
)}
```

- [ ] Update the `AppSection` usage in JSX to pass the new props:
```tsx
{theme?.apps.map(app => (
  <AppSection
    key={app.app}
    theme={theme}
    app={app}
    hover={hover}
    sectionsMode={sectionsMode && theme.sections !== undefined}
    onEdit={handleEdit}
    onEditSection={handleEditSection}
    onHoverSlot={setHover}
    onSlotDisappeared={handleSlotDisappeared}
  />
))}
```

- [ ] Update the `AppSection` function signature and body to accept the new props and conditionally render `SectionsTable`:

```tsx
function AppSection({
  theme,
  app,
  hover,
  sectionsMode,
  onEdit,
  onEditSection,
  onSlotDisappeared,
  onHoverSlot,
}: {
  theme: ThemeState;
  app: AppState;
  hover: HoverSlot;
  sectionsMode: boolean;
  onEdit: (id: string, k: string) => void;
  onEditSection: (sectionName: string, newKey: string) => void;
  onSlotDisappeared: () => void;
  onHoverSlot: (h: HoverSlot) => void;
}) {
  return (
    <section className="app-section">
      <h2>{app.app}</h2>
      <PromptPreview ansi={app.preview?.data ?? null} highlight={hover} />
      {sectionsMode && theme.sections ? (
        <SectionsTable
          config={theme.sections}
          app={app}
          palette={theme.palette}
          onEditSection={onEditSection}
        />
      ) : (
        <ColorSlotTable
          slots={app.colorSlots}
          palette={theme.palette}
          formatTokens={parseFormatTokens(app.fileRaw)}
          onEdit={onEdit}
          onSlotDisappeared={onSlotDisappeared}
          onHoverSlot={onHoverSlot}
        />
      )}
    </section>
  );
}
```

- [ ] Add CSS for the new elements to `src/styles.css`:

```css
.mode-toggle {
  display: inline-flex;
  gap: 2px;
  background: #0d0d0d;
  border-radius: 4px;
  padding: 2px;
}

.mode-toggle button {
  padding: 2px 10px;
  border-radius: 3px;
  background: transparent;
  color: #4a4a55;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
}

.mode-toggle button.active {
  background: #1f1f28;
  color: #dcd7ba;
}

.sections-table .separator-row td {
  color: #4a4a55;
  padding-left: 1.5em;
}
```

- [ ] Run: `bun run check` and `bun test` — both pass.

- [ ] Start the dev server (`bun run dev`) and open the app. Verify:
  - The cyberdream theme's `sections.json` needs to be created at `$THEMES_DIR/cyberdream/sections.json` with the same structure as the bamboo fixture (adjust `modules` to match what's actually in the cyberdream starship.toml).
  - The mode toggle appears in the header.
  - Sections mode shows the flat 7-row table with swatches.
  - Clicking a swatch opens the palette picker; picking a color updates the prompt preview.
  - Switching to slots mode shows the full slot table unchanged.
  - Undo, save, discard still work normally.

- [ ] Commit:
```bash
git add src/App.tsx src/styles.css
git commit -m "feat(sections): mode toggle wired to App"
```
