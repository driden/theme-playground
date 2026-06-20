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

## Favor `const` and immutability

Prefer `const` and immutable transformations (`map` / `filter` / `reduce` / spread) over `let` + in-place mutation. Reach for `let` only when the functional rewrite is genuinely worse (deep recursion needing a counter, performance-critical hot loop).

```ts
// Prefer
const tokens = matches.flatMap(parseToken);
const next = { ...state, dirty: true };

// Over
const tokens: Token[] = [];
for (const match of matches) tokens.push(parseToken(match));
state.dirty = true;
```

When the lambda just forwards its argument (`x => fn(x)`), drop the lambda and pass the function directly.

The point: every line reads top-to-bottom with one meaning — no scanning for reassignments, no "did this change?" debugging.

## No `!`, `!!`, or magical `as` casts

Don't write `!` non-null assertions, `!!` truthy-coercions used as narrowing, or `as` casts that exist purely to silence the compiler. They turn compile-time errors into runtime surprises (`Cannot read properties of undefined`) and lie about the data shape.

Use instead:
- **Assertion functions** — `assertNonNull(x, label): asserts x is T` in `src/lib/assert.ts`. Narrows the type AND throws a useful error if the invariant fails.
- **Return-helpers** for repeated patterns — `childAt(node, i)` in `src/lib/slot-discovery.ts` wraps the assertion so call sites stay one-liners.
- **Runtime guards** at boundaries — `isPaletteRole(s)` narrows a `string` to `PaletteRole` only after a Set lookup.
- **Refactor to eliminate the nullable** — `for (const m of text.matchAll(re))` instead of `while ((m = re.exec(text)) !== null) { … m[1]! … }`; `queue.shift()` instead of `array[i++]!`.

**Casts that ARE acceptable:**
- At runtime-validated boundaries (`SchemaName.parse(x)` returns a typed value; inside a typed helper, `as Tuple<N>` after a `.length === N` check is sound).
- Branded-type constructors (`asSlotId(s)`).
- The cast must be **co-located with the validation that makes it sound**.

If you're tempted to write `!` or `as`, ask: "What runtime check would prove this is safe?" If you can name one, write an assertion function. If you can't, the nullable / loose type is real and needs handling.

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
- **Accessibility enforcement** — `lint/a11y/useKeyWithClickEvents` and `lint/a11y/noStaticElementInteractions` are disabled in `biome.json`. `useButtonType` is kept on. Localhost dev tool; not worth the cost of converting swatches to ARIA-correct buttons.
- **Path-traversal hardening beyond the `[\w-]+` route regex** — also a localhost-only concern.

## Tooling

- **Biome 2.x** is the formatter + linter. `bun run check` runs both; `bun run check:fix` applies. CI hook can be `bun run check`.
- The linter runs with `recommended` rules, minus the a11y exceptions above.
- One inline opt-out: `CodeSample.tsx` carries `// biome-ignore-all format` because its inner arrays represent visual lines of rendered code; Biome's default would expand each to one-token-per-line and destroy the structure.

## What "good" looks like in a PR here

1. Strict types + boundary validation, no ad-hoc widening
2. No section separators, no one-letter vars outside iteration
3. Tests pass (`bun test`) and `tsc --noEmit` clean
4. Comments only where the WHY is non-obvious
5. Don't add features the task didn't ask for
