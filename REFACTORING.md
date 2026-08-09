# Refactoring

## Correctness

### Handle `themeExists` results explicitly

`themeExists` returns `EitherAsync<IOError, boolean>`. Awaiting it produces an `Either`, not the contained boolean, and every `Either` object is truthy. The checks in `apps/server/src/server.ts` and `apps/server/src/apps/state.ts` therefore accept `Right(false)` and `Left(error)` as if the theme existed.

- [ ] Match both consumers explicitly.
- [ ] Continue for `Right(true)`.
- [ ] Return HTTP 404 for `Right(false)`.
- [ ] Return HTTP 500 for `Left(error)`.
- [ ] Add `apps/server/test/theme-existence.test.ts`.
- [ ] Mock `themeExists` rather than config or the filesystem.
- [ ] Verify `Right(false)` produces 404 and `Left(IOError)` produces 500.
- [ ] Dynamically import consumers after installing Bun module mocks.

### Await theme actions

`apps/server/src/apps/state.ts` starts `handleUndo`, `handleSave`, or `handleDiscard`, then immediately builds state. Responses can contain stale file and history state.

- [ ] Await each selected action before calling `buildAppState`.
- [ ] Add behavioral coverage through `handleAction` for save, discard, and undo.

## Architecture

### Break the server/state cycle

`apps/server/src/server.ts` imports `apps/state.ts`, while `apps/state.ts` imports `handleUndo` from `server.ts`.

- [ ] Move `handleUndo` beside save/discard or into a focused action module.
- [ ] Ensure application and state modules do not import the route module.

### Keep HTTP errors at the boundary

`apps/server/src/apps/state.ts` currently chooses HTTP status codes while building application state.

- [ ] Return typed application or domain errors from lower-level operations.
- [ ] Translate those errors to `HttpError` in the route layer.

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
