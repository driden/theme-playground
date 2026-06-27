import type { AppName } from "@playground/lib/types";

const HISTORY_LIMIT = 50;
const histories = new Map<string, string[]>();
const histKey = (theme: string, app: AppName) => `${theme}/${app}`;

export function pushHistory(theme: string, app: AppName, snapshot: string) {
  const key = histKey(theme, app);
  const stack = histories.get(key) ?? [];
  stack.push(snapshot);
  if (stack.length > HISTORY_LIMIT) stack.shift();
  histories.set(key, stack);
}
export function popHistory(theme: string, app: AppName): string | null {
  return histories.get(histKey(theme, app))?.pop() ?? null;
}
export function canUndo(theme: string, app: AppName): boolean {
  return (histories.get(histKey(theme, app)) ?? []).length > 0;
}

export function clearHistory(theme: string, app: AppName) {
  histories.delete(histKey(theme, app));
}
