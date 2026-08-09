import fs from "node:fs/promises";
import { discoverSlots, paletteKeysFromStarshipToml } from "./slot-discovery";
import { themeExists, readSections } from "./themes";
import { resolveSection } from "@playground/lib/sections";
import { parseFormatTokens } from "@playground/lib/format-tokens";
import {
  isAppName,
  SlotEditBodySchema,
  SectionEditBodySchema,
  type AppName,
  type AppState,
  type SlotEditBody,
} from "@playground/lib/types";

import type { Serve } from "bun";
import { HttpError } from "./http.error";
import { ensureDraft } from "./draft";
import { pushHistory } from "./history";
import { buildAppState, buildThemeState } from "./apps/state";
import { type ActionError, handleAction } from "./apps/action";
import { getAllThemes } from "./theme.controller";

async function assertThemeExists(themeName: string): Promise<void> {
  if (!(await themeExists(themeName))) throw new HttpError(404, "unknown theme");
}

function assertAppName(app: string): asserts app is AppName {
  if (!isAppName(app)) throw new HttpError(404, `app '${app}' not supported`);
}

export const routes: Serve.Routes<undefined, string> = {
  "/api/themes": async () => json(await getAllThemes()),
  "/api/themes/:theme": async req => json(await handleGetTheme(req.params.theme as string)),
  "/api/themes/:theme/:app/:action": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;
      const action = req.params.action as string;
      return handleAction(theme, app, action).caseOf({
        Left: error => json({ error: error.message }, actionHttpStatus(error)),
        Right: json,
      });
    },
  },
  "/api/themes/:theme/:app": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;

      await assertThemeExists(theme);
      assertAppName(app);

      const parsed = SlotEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);

      const result = await handleSlotEdit(theme, app, parsed.data);

      if (isPaletteError(result)) {
        return json({ error: result.cause }, result.user ? 400 : 409);
      }

      return json(result);
    },
  },
  "/api/themes/:theme/:app/section": {
    POST: async req => {
      const theme = req.params.theme as string;
      const app = req.params.app as string;

      await assertThemeExists(theme);
      assertAppName(app);

      const parsed = SectionEditBodySchema.safeParse(await req.json());
      if (!parsed.success) throw new HttpError(400, `invalid body: ${parsed.error.message}`);
      const { sectionName, newPaletteKey } = parsed.data;

      const sections = await readSections(theme, app);
      if (!sections) throw new HttpError(400, "this theme has no starship.sections.json");

      const draft = await ensureDraft(theme, app);
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
        throw new HttpError(404, `section '${sectionName}' not found or has no editable slots`);
      }

      pushHistory(theme, app, current);
      // Apply right-to-left so earlier byte offsets remain valid after each splice.
      const sorted = [...targetSlots].sort((a, b) => b.start - a.start);
      const next = sorted.reduce(
        (acc, slot) => acc.slice(0, slot.start) + newPaletteKey + acc.slice(slot.end),
        current,
      );
      await fs.writeFile(draft, next, "utf8");
      return json(await buildAppState(theme));
    },
  },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleGetTheme(themeName: string) {
  await assertThemeExists(themeName);
  return buildThemeState(themeName);
}

function actionHttpStatus(error: ActionError): number {
  switch (error.kind) {
    case "ThemeNotFound":
    case "UnsupportedApp":
    case "UnsupportedAction":
      return 404;
    case "NothingToUndo":
      return 400;
    case "ThemeLookupFailed":
    case "ActionFailed":
      return 500;
    default: {
      const exhaustiveError: never = error;
      return exhaustiveError;
    }
  }
}

type PaletteError = { cause: string; user: boolean };

export function isPaletteError(obj: object): obj is PaletteError {
  if ((obj as PaletteError).cause != null) {
    return true;
  }
  return false;
}

export async function handleSlotEdit(
  themeName: string,
  app: AppName,
  req: SlotEditBody,
): Promise<AppState | PaletteError> {
  const { slotId, newPaletteKey } = req;
  const draft = await ensureDraft(themeName, app);
  const current = await fs.readFile(draft, "utf8");
  const palette = paletteKeysFromStarshipToml(current);
  if (!palette.has(newPaletteKey.toLowerCase())) {
    return {
      user: true,
      cause: `key '${newPaletteKey}' not in [palettes.theme] — run \`theme build\`?`,
    };
  }
  const slots = discoverSlots(current, palette, "name-token");
  const slot = slots.find(s => s.id === slotId);
  if (!slot)
    return {
      user: false,
      cause: `slot '${slotId}' not found in current file (file may have changed)`,
    };

  pushHistory(themeName, app, current);
  const next = current.slice(0, slot.start) + newPaletteKey + current.slice(slot.end);
  await fs.writeFile(draft, next, "utf8");
  return buildAppState(themeName);
}
