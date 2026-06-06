# TODO

Deferred work identified during development. Each item is scoped small enough to fit a single focused PR. Items are listed in rough priority order within each section.

## Correctness

### TOCTOU race + non-atomic writes on slot edit
`server.ts` slot-edit handler (the `POST /api/themes/:name/:app` route) reads the draft, discovers slots, splices by byte offset, then `fs.writeFile`s. Two near-simultaneous edits both compute offsets against the same source; the second splices at a stale offset and can corrupt the file. `fs.writeFile` is non-atomic — a partial write leaves a truncated draft. Fix: per-(theme, app) mutex around the read/splice/write sequence + atomic writes via `fs.rename` from a tempfile. Write a regression test first.

### `save` doesn't clear undo history
`server.ts` action handler, save branch — `discard` calls `clearHistory`, `save` doesn't. After saving, undo can rewrite the on-disk file with stale snapshots. Needs a UX decision before patching: clear on save (consistent with discard) vs preserve undo across save (current behavior, but the data loss path is real). See PR #1 conversation for context.

## Error UX / running the app

### Missing or empty `THEMES_DIR` is unfriendly
- When `THEMES_DIR` doesn't exist, `fs.readdir` in `src/lib/themes.ts` throws ENOENT. Server returns generic `"internal server error"` 500 with no path info; user has no diagnostic.
- When `THEMES_DIR` exists but is empty, frontend shows a blank page with an empty dropdown — no banner, no empty-state, no clue.

Proposed fix (see chat history for full design):
1. Drop the `"internal server error"` mask in `server.ts`; return `errMessage(e)` in 500 bodies. Localhost dev tool — leaking error messages including paths is the whole point of useful diagnostics.
2. Change `/api/themes` response to `{ themesDir, themes }` so the frontend has the path for both the empty-state and the error banner.
3. Frontend empty-state component: "No themes in `<themesDir>`. Set `THEMES_DIR=…` or populate the directory."

### `.env` support for runtime configuration
Currently `THEMES_DIR` is the only knob and users must `export` it each shell session (or set up direnv). Bun auto-loads `.env` files at the working directory — add:
- `.env.example` checked into the repo, documenting available vars (`THEMES_DIR`, and the others below as they get added).
- `.env` added to `.gitignore` so per-machine config doesn't leak.
- README updated to mention `cp .env.example .env` as the first-run step.

Other defaults worth making overridable while here:
- `PORT` — hardcoded to `5174` in `server.ts`.
- `DRAFTS_DIR` — currently `./.drafts` relative to `server.ts`.
- `STARSHIP_BINARY` — currently the literal `"starship"` on PATH.

### Starship subprocess has no timeout
`server.ts` `renderStarship` — `Bun.spawn` runs `starship prompt` with no timeout. A hung starship (broken config, infinite recursion in a custom command) blocks the request indefinitely and the browser tab spins forever. Use `Bun.spawn`'s `timeout` option or wrap in an `AbortController` with ~5s budget.

## Architectural

### Split into `src/backend/` and `src/frontend/`
Current layout mixes concerns:
- `server.ts` at repo root
- `src/api.ts`, `src/App.tsx`, `src/main.tsx`, `src/components/*` — frontend
- `src/lib/types.ts`, `src/lib/assert.ts`, `src/lib/err.ts` — shared
- `src/lib/themes.ts`, `src/lib/slot-discovery.ts` — backend-only
- `src/lib/format-tokens.ts` — frontend-only

Proposed:
- `src/shared/` (or keep `src/lib/`): types.ts, assert.ts, errMessage helper — used by both halves
- `src/backend/`: server.ts (moved here), themes.ts, slot-discovery.ts
- `src/frontend/`: App.tsx, main.tsx, api.ts, components/, format-tokens.ts, err.ts, styles.css

Update `vite.config.ts`, `tsconfig.json`, `package.json` scripts, and imports across the codebase. While here: server.ts is also long (~270 lines) and worth splitting — route handlers separate from draft/history state separate from subprocess management. The reorg is the natural time to do this.

### ANSI palette lookup falls back to "#000"
`src/components/ColorSlotTable.tsx` — slots referencing `color12` look up in `theme.palette` (from colors.toml, semantic-only), which never has ANSI keys (those live in `starship.toml`'s `[palettes.theme]` table). Currently silently falls back to `"#000"`. Fix: server should expose both palettes (e.g. extend `AppState` with `ansiPalette: Record<AnsiRole, HexColor>` derived from the starship config), and the lookup checks both.

### `ColorSlot.field` smuggles two meanings
`src/lib/slot-discovery.ts` — `field` holds the raw TOML key (`"style"`, `"style_user"`) for style-field slots AND a human label (`"format (#N)"`) for bracket slots. Future code that wants to use `field` programmatically (e.g. to look up the original TOML key) trips. Split into `field` (raw key) + optional `fieldLabel` (presentation), or use a discriminated union.

### `tableName` sentinel collision
`src/lib/slot-discovery.ts` `tableName` — returns the string `"format"` both for malformed table headers AND for the actual `[format]` section. The collision is load-bearing in `ColorSlotTable.tsx` (`bySection.get("format")`). Either document the invariant explicitly or model with a tagged union (`{ kind: "root" } | { kind: "table"; name: string }`).

### `paletteKeysFromStarshipToml` edge cases
`src/lib/slot-discovery.ts` `paletteKeysFromStarshipToml` only handles bare-key palettes under exactly two-segment dotted keys (`[palettes.theme]`). Silently drops:
- Quoted palette names (`[palettes."weird-name"]`)
- Three-segment dotted headers (`[palettes.theme.dark]`)
- Quoted keys inside the palette table

Pick: support them, or fail loudly with a parse error.

## Documentation

### Rewrite README, move technical details to `docs/`
Current `README.md` is overloaded — it documents internal architecture (file-by-file tour, the click round-trip lifecycle, slot-discovery internals, font stack mechanics) that a new user or contributor doesn't need before they run the thing. The "how do I run it" message gets buried.

Proposed split:
- `README.md` (top-level) — what the tool does in one paragraph, install + run in three lines, a screenshot, link to `docs/` for the rest. Aim for the page to be readable in 30 seconds.
- `docs/architecture.md` — the file-by-file tour, the click round-trip, slot-discovery internals, splice-preservation guarantee, design rationale, links to upstream specs.
- `docs/fonts.md` (or keep inline in architecture) — the Comic Code / Hack Nerd Font / Monaco fallback story.
- `docs/extraction.md` — `nvim-theme-extractor.lua` contract (the 20 semantic roles, the chain-resolution rationale), since that file now lives in this repo.

While here: README's "What's inside" tree includes paths that have since moved (`src/lib/slot-discovery.ts` is correct, but `src/api.ts` is now a thin parsed-response wrapper, not "fetch wrappers + shared types"). Sync or delete.

## Test coverage

### Replace one of the byte-identical golden fixtures
`test/fixtures/themes/{bamboo,kanagawa}/starship.toml` are byte-identical except for the `[palettes.theme]` hex values — they produce identical `*-slots.json` output. Two fixtures, one fixture's worth of signal. Replace one with structurally different content: dotted palette key, quoted key, missing palette table, mixed-case keys, or a file with no `[palettes.X]` table at all.

### HTTP smoke tests for `server.ts`
Currently zero coverage for the route handlers: slot-edit (`POST /api/themes/:name/:app`), action (`undo`/`save`/`discard`), and the 404 fallthrough. The destructive ones (save, discard) overwrite real files — they deserve a test. `Bun.serve` is trivial to spin up against a `tmpdir()` populated from `test/fixtures/themes/`. Locks the public API contract.

## YAGNI — revisit when a second use case appears

### Extract `rgbToHex` to `src/lib/color.ts`
`src/components/PromptPreview.tsx` — 8-line helper with one caller. Reviewer wanted it extracted to a dedicated file; deferred under YAGNI until a second consumer materializes.
