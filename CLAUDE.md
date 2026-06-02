# Working in this repo

A small React + Bun web app for visually editing starship prompt themes. See `README.md` for what it does and how to run it.

This file captures conventions established with the project maintainer. Follow them.

## Code style

**No one-letter variable names** except `i`/`j`/`k` as indices in iteration callbacks. Element names in `.map`/`.forEach`/`.filter` should mirror the singular form of the collection.

```ts
// Right
items.map((item, i) => ...)
slots.forEach((slot, i) => ...)
groups.flatMap(group => ...)

// Wrong
items.map((s, idx) => ...)   // "s" too cryptic; "idx" adds keystrokes without clarity
groups.map((g, i) => ...)    // "g" doesn't mirror "groups"
```

**No section-separator comments.** Don't add ASCII dividers like `// ── helpers ──────`, `// === section ===`, etc. They don't add information that good naming + file organization wouldn't already convey, and they encourage cramming too much into one file. If a file feels like it needs section markers, split the file instead.

**No emojis in code or commits** unless the user asks for them.

## Type discipline

**Types drive the model — not the other way around.** Define the strictest type that expresses intent first, then force runtime data to conform via validation at boundaries. If you find yourself widening a type (`Record<string, …>`, `unknown`, `any`) to fit ad-hoc data, that's a smell.

Concrete patterns this implies in this codebase:
- `Palette` is `{ [K in PaletteRole]: HexColor }` — closed. Theme files that don't conform must be reshaped at the boundary (`readPalette` in `src/lib/themes.ts`), not accommodated by widening the type.
- Boundary inputs (HTTP body, file content, env) get validated with Zod (`SlotEditBodySchema`, etc.) or hand-rolled guards. The cast site becomes a validation site.
- `noUncheckedIndexedAccess: true` is on. Lookups with a runtime string return `T | undefined` — handle the `undefined` case, don't `as`-cast it away.
- Use `catch (e: unknown)` plus the `errMessage(e)` helper. Never `catch (e: any)`.
- Use exhaustive `switch` with a `never` default on discriminated unions (`SlotMode`) so future variants fail to compile.

## Maintaining shared types

`src/lib/types.ts` is the single source of truth for shared types across server and client. Don't redeclare the same type elsewhere.

If you need a runtime list of role names (`SEMANTIC_ROLES`, `ANSI_ROLES`), derive the type from the const array (`typeof X[number]`), not vice versa. Single source for both compile-time and runtime use.

## React patterns

Class components are only used for **`ErrorBoundary`** (React's error-boundary API has no hook equivalent — required by the framework, not preference). Everything else uses hooks.

Effects that fetch should be cancellable. Use either an `AbortController` or a `cancelled` flag in the effect's cleanup so late responses don't overwrite newer state.

Toasts/timers go through `useToast` (in `App.tsx`) — it owns a timer ref and `clearTimeout`s on re-fire so overlapping calls don't clobber each other.

## Comments

Default: write no comments. Only add one when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug. Don't restate the code.

Don't reference foreign-repo line numbers (`starship/src/config.rs:382-389`) — they rot on every upstream release. Reference the function name only.

Don't use temporal anchors like `v1`/`v2`/`TODO(v2)` — they become noise after the next version ships. Phrase as feature-gated: `"not yet supported"`, `"TODO: hex-literal mode (for tmux/fzf)"`.

## Testing

`bun test` runs the full suite. Tests cover the pure layers (`slot-discovery`, `format-tokens`, `groupSlots`/`orderByPrompt`, splice round-trip against real fixtures).

Don't gut existing tests when refactoring — if a refactor would invalidate a test, the refactor probably broke a real contract.

## Out of scope for this codebase

- **Same-origin / CSRF guards** — this is a localhost-only personal dev tool. The user has explicitly deprioritized network-layer security hardening.
- **Linting** — no linter is installed; not needed at this size.
- **Path-traversal hardening beyond the `[\w-]+` route regex** — also a localhost-only concern.

## What "good" looks like in a PR here

1. Strict types + boundary validation, no ad-hoc widening
2. No section separators, no one-letter vars outside iteration
3. Tests pass (`bun test`) and `tsc --noEmit` clean
4. Comments only where the WHY is non-obvious
5. Don't add features the task didn't ask for
