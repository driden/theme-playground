import fs from "node:fs/promises";
import {
  type AppName,
  type AppState,
  isAppName,
  type PlaygroundError,
} from "@playground/lib/types";
import { EitherAsync, Left, Maybe } from "purify-ts";
import { originalPath } from "../config";
import { draftPath, handleDiscard, handleSave } from "../draft";
import type { IOError } from "../errors/IOError";
import { popHistory } from "../history";
import { themeExists } from "../themes";
import { fromPromise } from "../utils/purify";
import { buildAppState } from "./state";

export type ActionError =
  | PlaygroundError<"ThemeNotFound", { themeName: string }>
  | PlaygroundError<"ThemeLookupFailed", { error: IOError }>
  | PlaygroundError<"UnsupportedApp", { app: string }>
  | PlaygroundError<"UnsupportedAction", { action: string }>
  | PlaygroundError<"NothingToUndo", Record<never, never>>
  | PlaygroundError<"ActionFailed", { error: unknown }>;

export const ActionErrors = {
  themeNotFound: (themeName: string): ActionError => ({
    kind: "ThemeNotFound",
    message: `Unknown theme '${themeName}'`,
    themeName,
  }),
  themeLookupFailed: (error: IOError): ActionError => ({
    kind: "ThemeLookupFailed",
    message: error.message,
    error,
  }),
  unsupportedApp: (app: string): ActionError => ({
    kind: "UnsupportedApp",
    message: `App '${app}' not supported`,
    app,
  }),
  unsupportedAction: (action: string): ActionError => ({
    kind: "UnsupportedAction",
    message: `Action '${action}' not supported`,
    action,
  }),
  nothingToUndo: (): ActionError => ({
    kind: "NothingToUndo",
    message: "Nothing to undo",
  }),
  actionFailed: (error: unknown): ActionError => ({
    kind: "ActionFailed",
    message: error instanceof Error ? error.message : String(error),
    error,
  }),
};

export type ActionsService = {
  themeExists: typeof themeExists;
  buildAppState: typeof buildAppState;
  save: typeof handleSave;
  discard: typeof handleDiscard;
  undo: (themeName: string, app: AppName, draft: string) => EitherAsync<ActionError, void>;
};

export function createHandleAction(services: ActionsService) {
  return function handleAction(
    themeName: string,
    app: string,
    action: string,
  ): EitherAsync<ActionError, AppState> {
    return services
      .themeExists(themeName)
      .mapLeft(ActionErrors.themeLookupFailed)
      .chain(exists =>
        exists
          ? runAction(services, themeName, app, action)
          : EitherAsync.liftEither(Left(ActionErrors.themeNotFound(themeName))),
      );
  };
}

function runAction(
  services: ActionsService,
  themeName: string,
  app: string,
  action: string,
): EitherAsync<ActionError, AppState> {
  if (!isAppName(app)) {
    return EitherAsync.liftEither(Left(ActionErrors.unsupportedApp(app)));
  }

  if (action !== "undo" && action !== "save" && action !== "discard") {
    return EitherAsync.liftEither(Left(ActionErrors.unsupportedAction(action)));
  }

  const draft = draftPath(themeName, app);
  const original = originalPath(themeName, app);

  const result = (() => {
    switch (action) {
      case "undo":
        return services.undo(themeName, app, draft);
      case "save":
        return fromPromise(
          () => services.save(themeName, app, draft, original),
          ActionErrors.actionFailed,
        );
      case "discard":
        return fromPromise(
          () => services.discard(themeName, app, draft, original),
          ActionErrors.actionFailed,
        );
      default: {
        const exhaustiveAction: never = action;
        return EitherAsync.liftEither(Left(ActionErrors.unsupportedAction(exhaustiveAction)));
      }
    }
  })();

  return result.chain(() =>
    fromPromise(() => services.buildAppState(themeName), ActionErrors.actionFailed),
  );
}

function handleUndo(
  themeName: string,
  app: AppName,
  draft: string,
): EitherAsync<ActionError, void> {
  return EitherAsync.liftEither(
    Maybe.fromNullable(popHistory(themeName, app)).toEither(ActionErrors.nothingToUndo()),
  ).chain(previousTheme =>
    fromPromise(() => fs.writeFile(draft, previousTheme, "utf8"), ActionErrors.actionFailed),
  );
}

export const handleAction = createHandleAction({
  themeExists,
  buildAppState,
  save: handleSave,
  discard: handleDiscard,
  undo: handleUndo,
});
