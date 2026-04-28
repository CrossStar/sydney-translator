import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SettingsDialog, type SettingsDialogValues } from './components/SettingsDialog';
import { TranslatorPanel } from './components/TranslatorPanel';
import {
  exitApplication,
  getAutostartEnabled,
  hideCurrentWindow,
  listenToHelperEvents,
  listenToOpenSettings,
  listenToTranslationChunks,
  loadSettings,
  minimizeCurrentWindow,
  reloadHelper,
  saveSettingsWithApiKey,
  setAlwaysOnTop,
  setAutostartEnabled,
  startDraggingCurrentWindow,
  translateText
} from './lib/ipc';
import { t, type Locale } from './lib/i18n';
import { createInitialState, reduceHelperEvent, validateSettings } from './state/app-store';
import type { CloseButtonAction, Settings } from './types/app';

type Page = 'translate' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('translate');
  const [settings, setSettings] = useState<Settings>(createInitialState().settings);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [autostartEnabled, setAutostartEnabledState] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [rememberCloseChoice, setRememberCloseChoice] = useState(false);

  const inputRef = useRef('');
  const noticeRef = useRef<string | null>(null);
  const settingsRef = useRef<Settings>(createInitialState().settings);

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { noticeRef.current = notice; }, [notice]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const locale: Locale = settings.uiLanguage ?? 'en';

  useEffect(() => {
    let cancelled = false;
    let unsubscribeHelper: (() => void) | null = null;
    let unsubscribeOpenSettings: (() => void) | null = null;

    async function init() {
      try {
        const persisted = await loadSettings();
        if (!cancelled && persisted) {
          settingsRef.current = persisted;
          setSettings(persisted);
        }
      } catch {
        if (!cancelled) setSettingsError('Unable to load settings.');
      }

      try {
        const enabled = await getAutostartEnabled();
        if (!cancelled) setAutostartEnabledState(enabled);
      } catch { /* autostart not available in dev */ }

      unsubscribeHelper = await listenToHelperEvents((event) => {
        if (cancelled) return;
        const next = reduceHelperEvent(
          { ...createInitialState().translation, input: inputRef.current, notice: noticeRef.current, error: null },
          event
        );
        inputRef.current = next.input;
        noticeRef.current = next.notice;
        setInput(next.input);
        setError(next.error);
        setNotice(next.notice);

        if (event.source === 'selection' && event.text?.trim()) {
          void handleTranslate(event.text.trim());
        }
      });

      unsubscribeOpenSettings = await listenToOpenSettings(() => {
        if (cancelled) return;
        setSettingsError(null);
        setPage('settings');
      });
    }

    void init();

    return () => {
      cancelled = true;
      unsubscribeHelper?.();
      unsubscribeOpenSettings?.();
    };
  }, []);

  async function persistSettings(requested: Settings, clearApiKey = false, apiKey = '') {
    const previous = settingsRef.current;
    const shouldReloadHelper =
      previous.globalHotkey !== requested.globalHotkey ||
      previous.selectionMode !== requested.selectionMode;

    setIsSavingSettings(true);
    setSettingsError(null);
    try {
      const persisted = await saveSettingsWithApiKey({
        settings: requested,
        apiKey,
        clearApiKey
      });
      settingsRef.current = persisted;
      setSettings(persisted);
      if (shouldReloadHelper) {
        await reloadHelper();
      }
      return persisted;
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to save settings.');
      throw err;
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleToggleAlwaysOnTop() {
    const next = !isAlwaysOnTop;
    await setAlwaysOnTop(next);
    setIsAlwaysOnTop(next);
  }

  async function handleToggleAutostart() {
    const next = !autostartEnabled;
    await setAutostartEnabled(next);
    setAutostartEnabledState(next);
  }

  async function handleSaveSettings(values: SettingsDialogValues) {
    const previous = settingsRef.current;
    const requested: Settings = {
      baseUrl: values.baseUrl,
      apiKeyPresent: values.clearApiKey ? false : previous.apiKeyPresent || Boolean(values.apiKey.trim()),
      model: values.model,
      sourceLanguage: values.sourceLanguage,
      targetLanguage: values.targetLanguage,
      globalHotkey: values.globalHotkey,
      selectionMode: values.selectionMode,
      uiLanguage: values.uiLanguage,
      closeButtonAction: values.closeButtonAction
    };

    await persistSettings(requested, values.clearApiKey, values.apiKey);
  }

  async function handleTranslate(textOverride?: string) {
    const currentSettings = settingsRef.current;
    const errs = validateSettings(currentSettings, currentSettings.apiKeyPresent);
    if (errs.length > 0) { setError(errs[0]); return; }

    const textToTranslate = textOverride ?? inputRef.current;
    if (!textToTranslate.trim()) return;

    setIsLoading(true);
    setError(null);
    setNotice(null);
    setOutput('');

    let unsubChunks: (() => void) | null = null;
    try {
      unsubChunks = await listenToTranslationChunks((chunk) => {
        flushSync(() => {
          setOutput((prev) => prev + chunk);
        });
      });
      await translateText(
        currentSettings.baseUrl,
        '',
        currentSettings.model,
        currentSettings.sourceLanguage,
        currentSettings.targetLanguage,
        textToTranslate
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to translate the current text.');
    } finally {
      unsubChunks?.();
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    if (!output.trim()) return;
    try {
      await navigator.clipboard.writeText(output);
      setError(null);
      setNotice(null);
    } catch {
      setError('Unable to copy translation.');
    }
  }

  async function applyCloseAction(action: CloseButtonAction, remember: boolean) {
    if (remember) {
      const requested: Settings = {
        ...settingsRef.current,
        closeButtonAction: action
      };
      await persistSettings(requested);
    }

    setShowClosePrompt(false);
    setRememberCloseChoice(false);

    if (action === 'exit') {
      await exitApplication();
      return;
    }

    await hideCurrentWindow();
  }

  async function handleCloseWindow() {
    const action = settingsRef.current.closeButtonAction;
    if (action === 'hide') {
      await hideCurrentWindow();
      return;
    }
    if (action === 'exit') {
      await exitApplication();
      return;
    }
    setRememberCloseChoice(false);
    setShowClosePrompt(true);
  }

  return (
    <>
      <nav
        className="nav"
        onDoubleClick={() => {
          void startDraggingCurrentWindow();
        }}
      >
        <div className="nav-drag-zone" onMouseDown={() => { void startDraggingCurrentWindow(); }}>
          <span className="nav-brand">Translator</span>
        </div>
        <div className="nav-tabs">
          <button
            className={`nav-tab${page === 'translate' ? ' active' : ''}`}
            type="button"
            onClick={() => setPage('translate')}
          >
            {t(locale, 'nav_translate')}
          </button>
          <button
            className={`nav-tab${page === 'settings' ? ' active' : ''}`}
            type="button"
            onClick={() => { setSettingsError(null); setPage('settings'); }}
          >
            {t(locale, 'nav_settings')}
          </button>
        </div>
        <div className="nav-window-controls">
          <button
            aria-label="Minimize window"
            className="nav-window-btn"
            type="button"
            onClick={() => { void minimizeCurrentWindow(); }}
          >
            −
          </button>
          <button
            aria-label={t(locale, 'close_button_label')}
            className="nav-window-btn nav-window-btn-close"
            type="button"
            onClick={() => { void handleCloseWindow(); }}
          >
            ×
          </button>
        </div>
      </nav>

      {page === 'translate' ? (
        <TranslatorPanel
          error={error}
          input={input}
          isLoading={isLoading}
          locale={locale}
          notice={notice}
          onCopy={handleCopy}
          onInputChange={(value) => { setNotice(null); setInput(value); }}
          onTranslate={handleTranslate}
          output={output}
        />
      ) : (
        <SettingsDialog
          autostartEnabled={autostartEnabled}
          error={settingsError}
          fetchedModels={fetchedModels}
          initialSettings={settings}
          isAlwaysOnTop={isAlwaysOnTop}
          isSaving={isSavingSettings}
          locale={locale}
          onFetchedModels={setFetchedModels}
          onSave={handleSaveSettings}
          onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
          onToggleAutostart={handleToggleAutostart}
        />
      )}

      {showClosePrompt && (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="modal-card" role="dialog">
            <h2 className="modal-title">{t(locale, 'close_prompt_title')}</h2>
            <p className="modal-body">{t(locale, 'close_prompt_body')}</p>
            <label className="modal-checkbox">
              <input
                checked={rememberCloseChoice}
                type="checkbox"
                onChange={(e) => setRememberCloseChoice(e.target.checked)}
              />
              <span>{t(locale, 'close_prompt_remember')}</span>
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setShowClosePrompt(false)}>
                {t(locale, 'close_prompt_cancel')}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => { void applyCloseAction('hide', rememberCloseChoice); }}>
                {t(locale, 'close_prompt_hide')}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => { void applyCloseAction('exit', rememberCloseChoice); }}>
                {t(locale, 'close_prompt_exit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
