import { config } from "./config";
import type { AppName } from "@playground/lib/types";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_CONFIG_FILE, originalPath } from "./config";
import { clearHistory } from "./history";

export function getDraftDir(theme: string, app: AppName): string {
  return path.join(config().themesDir, theme, ".drafts", app);
}

export function draftPath(theme: string, app: AppName): string {
  return path.join(getDraftDir(theme, app), APP_CONFIG_FILE[app]);
}

// First touch: copy original → draft. Idempotent on subsequent calls.
export async function ensureDraft(theme: string, app: AppName): Promise<string> {
  const draft = draftPath(theme, app);
  await fs.mkdir(getDraftDir(theme, app), { recursive: true });
  if (!(await Bun.file(draft).exists())) {
    const original = await fs.readFile(originalPath(theme, app), "utf8");
    await fs.writeFile(draft, original);
  }
  return draft;
}

export async function isDirty(theme: string, app: AppName): Promise<boolean> {
  const draftText = await fs.readFile(draftPath(theme, app), "utf8");
  const originalText = await fs.readFile(originalPath(theme, app), "utf8");
  return draftText !== originalText;
}

export async function handleSave(themeName: string, app: AppName, draft: string, original: string) {
  await ensureDraft(themeName, app);
  const draftText = await fs.readFile(draft, "utf8");
  await fs.writeFile(original, draftText, "utf8");
  clearHistory(themeName, app);
}

export async function handleDiscard(
  themeName: string,
  app: AppName,
  draft: string,
  original: string,
) {
  const originalText = await fs.readFile(original, "utf8");
  await fs.writeFile(draft, originalText, "utf8");
  clearHistory(themeName, app);
}
