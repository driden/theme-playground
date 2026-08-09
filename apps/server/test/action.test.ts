import type { AppState } from "@playground/lib/types";
import { describe, expect, mock, test } from "bun:test";
import { EitherAsync, Left, Right } from "purify-ts";
import { type ActionError, createHandleAction, type ActionsService } from "../src/apps/action";
import { IOErrors } from "../src/errors/IOError";

const appState: AppState = {
  app: "starship",
  fileRaw: "state after action",
  colorSlots: [],
  preview: null,
  previewError: null,
  slotError: null,
  dirty: false,
  canUndo: false,
};

function services(): ActionsService {
  return {
    themeExists: mock(() => EitherAsync.liftEither(Right(true))),
    buildAppState: mock(async () => appState),
    save: mock(async () => undefined),
    discard: mock(async () => undefined),
    undo: mock(() => EitherAsync.liftEither<ActionError, void>(Right(undefined))),
  };
}

describe("handleAction", () => {
  test("returns ThemeNotFound when the theme does not exist", async () => {
    const actionServices = services();
    actionServices.themeExists = mock(() => EitherAsync.liftEither(Right(false)));
    const handleAction = createHandleAction(actionServices);

    const result = await handleAction("missing", "starship", "save");

    expect(result.extract()).toMatchObject({ kind: "ThemeNotFound", themeName: "missing" });
    expect(actionServices.save).not.toHaveBeenCalled();
  });

  test("returns ThemeLookupFailed when checking the theme fails", async () => {
    const actionServices = services();
    const ioError = IOErrors.cantReadThemesFolder("/virtual/themes");
    actionServices.themeExists = mock(() => EitherAsync.liftEither(Left(ioError)));
    const handleAction = createHandleAction(actionServices);

    const result = await handleAction("bamboo", "starship", "save");

    expect(result.extract()).toMatchObject({ kind: "ThemeLookupFailed", error: ioError });
    expect(actionServices.save).not.toHaveBeenCalled();
  });

  test("returns UnsupportedApp for an unknown app", async () => {
    const actionServices = services();
    const handleAction = createHandleAction(actionServices);

    const result = await handleAction("bamboo", "unknown", "save");

    expect(result.extract()).toMatchObject({ kind: "UnsupportedApp", app: "unknown" });
  });

  test.each(["save", "discard", "undo"])("awaits %s before building state", async action => {
    const events: string[] = [];
    const actionServices = services();
    actionServices.save = mock(async () => {
      events.push("action");
    });
    actionServices.discard = mock(async () => {
      events.push("action");
    });
    actionServices.undo = mock(() =>
      EitherAsync<ActionError, void>(async () => {
        events.push("action");
      }),
    );
    actionServices.buildAppState = mock(async () => {
      events.push("state");
      return appState;
    });
    const handleAction = createHandleAction(actionServices);

    const result = await handleAction("bamboo", "starship", action);

    expect(result).toEqual(Right(appState));
    expect(events).toEqual(["action", "state"]);
  });
});
