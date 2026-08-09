# Refactoring

## Correctness

### Handle `themeExists` results explicitly

`themeExists` returns `EitherAsync<IOError, boolean>`. `handleAction` now preserves that result in its domain error channel, but the route-local checks in `apps/server/src/server.ts` still await an `Either` as though it were the contained boolean.

- [x] Chain `handleAction` from `themeExists` without unwrapping the `EitherAsync`.
- [x] Convert `Right(false)` to a typed `ThemeNotFound` error.
- [x] Convert `Left(IOError)` to a typed `ThemeLookupFailed` error.
- [x] Cover `themeExists` returning `Right(true)`, `Right(false)`, and `Left(IOError)`.
- [x] Cover the corresponding `handleAction` domain results through `ActionsService`.
- [ ] Handle the route-local `themeExists` consumers in `server.ts` explicitly.

### Await theme actions

`apps/server/src/apps/state.ts` starts `handleUndo`, `handleSave`, or `handleDiscard`, then immediately builds state. Responses can contain stale file and history state.

- [x] Await each selected action before calling `buildAppState`.
- [x] Add behavioral coverage through `handleAction` for save, discard, and undo.

## Architecture

### Break the server/state cycle

`apps/server/src/server.ts` imports `apps/state.ts`, while `apps/state.ts` imports `handleUndo` from `server.ts`.

- [x] Move `handleUndo` beside save/discard or into a focused action module.
- [x] Ensure application and state modules do not import the route module.

### Keep HTTP errors at the boundary

Application operations should return typed errors and leave HTTP response decisions to routes.

- [x] Return typed application or domain errors from lower-level operations.
- [x] Translate those errors to HTTP responses in the route layer.

### Finish decomposing `server.ts`

`apps/server/src/server.ts` still combines routes, request validation, theme validation, editing workflows, history coordination, filesystem writes, and response construction.

- [ ] Extract slot-edit orchestration into an application module.
- [ ] Extract section-edit orchestration into an application module.
- [ ] Leave Bun routing and HTTP conversion in `server.ts`.
- [ ] Consider moving pure single-slot and right-to-left multi-slot replacements to `apps/lib`.

## Dependencies

- [ ] Remove stale `neverthrow` from `apps/server/package.json` and `bun.lock`.
- [ ] Remove `@playground/lib` from its own `peerDependencies`.
- [ ] Remove `web-tree-sitter` from lib while no lib source imports it.
- [ ] Keep TypeScript in lib `devDependencies`, not `peerDependencies`.
- [ ] Put `zod` in lib runtime dependencies because lib source imports it.
