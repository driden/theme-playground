import { useCallback, useEffect, useRef, useState } from "react";
import {
  listThemes,
  getTheme,
  editSlot,
  editSection,
  undoEdit,
  saveDraft,
  discardDraft,
} from "./api";
import { PromptPreview } from "./components/PromptPreview";
import { ColorSlotTable } from "./components/ColorSlotTable";
import { SectionsTable } from "./components/SectionsTable";
import { Toggle } from "./components/Toggle";
import { ThemeSelector } from "./components/ThemeSelector";
import { CodeSample } from "./components/CodeSample";
import { PaletteLegend } from "./components/PaletteLegend";
import { parseFormatTokens } from "@playground/lib/format-tokens";
import {
  type AppState,
  type SlotRole,
  type ThemeListing,
  type ThemeState,
  errMessage,
} from "@playground/lib/types";

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
  const [font, setFont] = useState(DEFAULT_PROMPT_FONT);
  const [sectionsMode, setSectionsMode] = useState(true);
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

  async function handleEditSection(sectionName: string, newKey: string) {
    if (!theme) return;
    try {
      const updated = await editSection(theme.name, sectionName, newKey);
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
          <select
            className="font-picker"
            value={font}
            onChange={event => setFont(event.target.value)}
          >
            {PROMPT_FONTS.map(f => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      {theme && (
        <section className="app-section">
          <h2>code</h2>
          <div className="code-grid">
            <PaletteLegend palette={theme.palette} />
            <CodeSample palette={theme.palette} font={font} />
          </div>
        </section>
      )}
      {theme?.apps.map(app => (
        <AppSection
          key={app.app}
          theme={theme}
          app={app}
          hover={hover}
          font={font}
          sectionsMode={sectionsMode && theme.sections !== undefined}
          onSetSectionsMode={setSectionsMode}
          onEdit={handleEdit}
          onEditSection={handleEditSection}
          onHoverSlot={setHover}
          onSlotDisappeared={handleSlotDisappeared}
        />
      ))}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const PROMPT_FONTS: { label: string; value: string }[] = [
  {
    label: "Comic Code",
    value: '"Comic Code", "Hack Nerd Font Mono", Monaco, monospace',
  },
  { label: "Hack", value: '"Hack Nerd Font Mono", Monaco, monospace' },
];
const DEFAULT_PROMPT_FONT = '"Comic Code", "Hack Nerd Font Mono", Monaco, monospace';

function AppSection({
  theme,
  app,
  hover,
  font,
  sectionsMode,
  onSetSectionsMode,
  onEdit,
  onEditSection,
  onSlotDisappeared,
  onHoverSlot,
}: {
  theme: ThemeState;
  app: AppState;
  hover: HoverSlot;
  font: string;
  sectionsMode: boolean;
  onSetSectionsMode: (sectionsMode: boolean) => void;
  onEdit: (id: string, k: string) => void;
  onEditSection: (sectionName: string, newKey: string) => void;
  onSlotDisappeared: () => void;
  onHoverSlot: (h: HoverSlot) => void;
}) {
  return (
    <section className="app-section">
      <div className="app-section-head">
        <h2>{app.app}</h2>
        {theme.sections && (
          <Toggle
            options={[
              { value: "sections", label: "sections" },
              { value: "slots", label: "slots" },
            ]}
            value={sectionsMode ? "sections" : "slots"}
            onChange={value => onSetSectionsMode(value === "sections")}
          />
        )}
      </div>
      <PromptPreview ansi={app.preview?.data ?? null} highlight={hover} font={font} />
      {sectionsMode && theme.sections ? (
        <SectionsTable
          config={theme.sections}
          app={app}
          palette={theme.palette}
          onEditSection={onEditSection}
        />
      ) : (
        <ColorSlotTable
          slots={app.colorSlots}
          palette={theme.palette}
          formatTokens={parseFormatTokens(app.fileRaw)}
          onEdit={onEdit}
          onSlotDisappeared={onSlotDisappeared}
          onHoverSlot={onHoverSlot}
        />
      )}
    </section>
  );
}
