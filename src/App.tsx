import { useCallback, useEffect, useRef, useState } from "react";
import {
  listThemes,
  getTheme,
  editSlot,
  undoEdit,
  saveDraft,
  discardDraft,
  type ThemeListing,
  type ThemeState,
  type AppState,
} from "./api";
import type { SlotRole } from "./lib/slot-discovery";
import { parseFormatTokens } from "./lib/format-tokens";
import { errMessage } from "./lib/err";
import { PromptPreview } from "./components/PromptPreview";
import { ColorSlotTable } from "./components/ColorSlotTable";
import { ThemeSelector } from "./components/ThemeSelector";
import { CodeSample } from "./components/CodeSample";
import { PaletteLegend } from "./components/PaletteLegend";

type HoverSlot = { hex: string; role: SlotRole } | null;

function useToast(): { toast: string | null; showToast: (msg: string, ms?: number) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ms = 1500) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setToast(msg);
    timerRef.current = setTimeout(() => {
      setToast(null);
      timerRef.current = null;
    }, ms);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return { toast, showToast };
}

export default function App() {
  const [themes, setThemes] = useState<ThemeListing[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverSlot>(null);
  const { toast, showToast } = useToast();

  useEffect(() => {
    listThemes()
      .then(list => {
        setThemes(list);
        const initial = list.find(t => t.current) ?? list[0];
        if (initial) setActiveName(initial.name);
      })
      .catch((e: unknown) => setError(errMessage(e)));
  }, []);

  useEffect(() => {
    if (!activeName) return;
    setError(null);
    let cancelled = false;
    getTheme(activeName)
      .then(t => {
        if (!cancelled) setTheme(t);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [activeName]);

  async function handleEdit(slotId: string, newKey: string) {
    if (!theme) return;
    try {
      const updated = await editSlot(theme.name, slotId, newKey);
      setTheme(prev => (prev ? { ...prev, apps: [updated] } : prev));
    } catch (e: unknown) {
      setError(errMessage(e));
    }
  }

  async function handleReload() {
    if (!activeName) return;
    setError(null);
    try {
      const [list, t] = await Promise.all([listThemes(), getTheme(activeName)]);
      setThemes(list);
      setTheme(t);
      showToast("reloaded");
    } catch (e: unknown) {
      setError(errMessage(e));
    }
  }

  async function applyAppAction(fn: (name: string) => Promise<AppState>, successMsg: string) {
    if (!theme) return;
    try {
      const updated = await fn(theme.name);
      setTheme(prev => (prev ? { ...prev, apps: [updated] } : prev));
      showToast(successMsg);
    } catch (e: unknown) {
      setError(errMessage(e));
    }
  }
  const handleUndo = () => applyAppAction(undoEdit, "undone");
  const handleSave = () => applyAppAction(saveDraft, "saved");
  const handleDiscard = () => applyAppAction(discardDraft, "discarded");

  const handleSlotDisappeared = useCallback(() => {
    showToast("slot moved — pick again", 1800);
  }, [showToast]);

  const currentApp = theme?.apps[0];

  return (
    <div>
      <header className="app-header">
        <ThemeSelector themes={themes} active={activeName} onChange={setActiveName} />
        <div className="header-actions">
          {currentApp?.dirty && <span className="dirty-marker">● unsaved</span>}
          <button type="button" onClick={handleUndo} disabled={!currentApp?.canUndo}>
            undo
          </button>
          <button type="button" onClick={handleDiscard} disabled={!currentApp?.dirty}>
            discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!currentApp?.dirty}
            className="primary"
          >
            save
          </button>
          <button type="button" onClick={handleReload}>
            reload
          </button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {theme && (
        <section className="app-section">
          <h2>code</h2>
          <div className="code-grid">
            <PaletteLegend palette={theme.palette} />
            <CodeSample palette={theme.palette} />
          </div>
        </section>
      )}
      {theme?.apps.map(app => (
        <AppSection
          key={app.app}
          theme={theme}
          app={app}
          hover={hover}
          onEdit={handleEdit}
          onHoverSlot={setHover}
          onSlotDisappeared={handleSlotDisappeared}
        />
      ))}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function AppSection({
  theme,
  app,
  hover,
  onEdit,
  onSlotDisappeared,
  onHoverSlot,
}: {
  theme: ThemeState;
  app: AppState;
  hover: HoverSlot;
  onEdit: (id: string, k: string) => void;
  onSlotDisappeared: () => void;
  onHoverSlot: (h: HoverSlot) => void;
}) {
  return (
    <section className="app-section">
      <h2>{app.app}</h2>
      <PromptPreview ansi={app.preview?.data ?? null} highlight={hover} />
      <ColorSlotTable
        slots={app.colorSlots}
        palette={theme.palette}
        formatTokens={parseFormatTokens(app.fileRaw)}
        onEdit={onEdit}
        onSlotDisappeared={onSlotDisappeared}
        onHoverSlot={onHoverSlot}
      />
    </section>
  );
}
