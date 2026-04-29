import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { SettingsDialog, type SettingsDialogValues } from './components/SettingsDialog';
import { TranslatorPanel } from './components/TranslatorPanel';
import {
  checkForUpdate,
  exitApplication,
  getAutostartEnabled,
  hideCurrentWindow,
  listenToHelperEvents,
  listenToOpenSettings,
  listenToTranslationChunks,
  loadSettings,
  minimizeCurrentWindow,
  openUrl,
  reloadHelper,
  saveSettingsWithApiKey,
  setAlwaysOnTop,
  setAutostartEnabled,
  startDraggingCurrentWindow,
  translateText,
  type UpdateInfo
} from './lib/ipc';
import { t, type Locale } from './lib/i18n';
import { createInitialState, reduceHelperEvent, validateSettings } from './state/app-store';
import type { CloseButtonAction, Settings, ThemePreset } from './types/app';

type Page = 'translate' | 'settings';

const APP_VERSION = '0.0.2';
const CUSTOM_THEME_STYLE_ID = 'translator-custom-css';

function applyThemePreset(themePreset: ThemePreset) {
  document.documentElement.setAttribute('data-theme', themePreset);
}

function applyCustomCss(customCss: string) {
  let style = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = CUSTOM_THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = customCss;
}

export default function App() {
  const [page, setPage] = useState<Page>('translate');
  const [settings, setSettings] = useState<Settings>(createInitialState().settings);
  const [loadedApiKey, setLoadedApiKey] = useState('');
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
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
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const inputRef = useRef('');
  const noticeRef = useRef<string | null>(null);
  const settingsRef = useRef<Settings>(createInitialState().settings);

  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { noticeRef.current = notice; }, [notice]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { applyThemePreset(settings.themePreset); }, [settings.themePreset]);
  useEffect(() => { applyCustomCss(settings.customCss); }, [settings.customCss]);

  const locale: Locale = settings.uiLanguage ?? 'en';

  useEffect(() => {
    let cancelled = false;
    let unsubscribeHelper: (() => void) | null = null;
    let unsubscribeOpenSettings: (() => void) | null = null;

    async function init() {
      try {
        const result = await loadSettings();
        if (!cancelled && result) {
          settingsRef.current = result.settings;
          setSettings(result.settings);
          setLoadedApiKey(result.apiKey);
        }
      } catch {
        if (!cancelled) setSettingsError('Unable to load settings.');
      }

      try {
        const enabled = await getAutostartEnabled();
        if (!cancelled) setAutostartEnabledState(enabled);
      } catch { /* autostart not available in dev */ }

      // Check for updates in the background after a short delay
      setTimeout(async () => {
        if (cancelled) return;
        try {
          const info = await checkForUpdate(APP_VERSION, settingsRef.current.dismissedUpdate);
          if (!cancelled && info.hasUpdate) setUpdateInfo(info);
        } catch { /* network unavailable, silently skip */ }
      }, 3000);

      unsubscribeHelper = await listenToHelperEvents((event) => {
        if (cancelled) return;

        if (event.event === 'hotkey_error') {
          setSettingsError(`Hotkey registration failed: ${event.text ?? 'unknown error'}. Please set a different hotkey in Settings.`);
          setPage('settings');
          return;
        }

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

    setSettingsError(null);
    try {
      const persisted = await saveSettingsWithApiKey({
        settings: requested,
        apiKey,
        clearApiKey
      });
      settingsRef.current = persisted;
      setSettings(persisted);
      if (apiKey.trim()) setLoadedApiKey(apiKey.trim());
      if (shouldReloadHelper) {
        await reloadHelper();
      }
      return persisted;
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Unable to save settings.');
      throw err;
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
      apiKeyPresent: previous.apiKeyPresent || Boolean(values.apiKey.trim()),
      model: values.model,
      sourceLanguage: values.sourceLanguage,
      targetLanguage: values.targetLanguage,
      globalHotkey: values.globalHotkey,
      selectionMode: values.selectionMode,
      uiLanguage: values.uiLanguage,
      closeButtonAction: values.closeButtonAction,
      translationProvider: values.translationProvider,
      themePreset: values.themePreset,
      customCss: values.customCss,
      dismissedUpdate: previous.dismissedUpdate,
      proxyUrl: values.proxyUrl,
    };

    await persistSettings(requested, false, values.apiKey);
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
        textToTranslate,
        currentSettings.translationProvider,
        currentSettings.proxyUrl
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
      await persistSettings({ ...settingsRef.current, closeButtonAction: action });
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
    if (action === 'hide') { await hideCurrentWindow(); return; }
    if (action === 'exit') { await exitApplication(); return; }
    setRememberCloseChoice(false);
    setShowClosePrompt(true);
  }

  async function handleUpdateNow() {
    if (!updateInfo) return;
    await openUrl(updateInfo.releaseUrl);
    setUpdateInfo(null);
  }

  async function handleUpdateSkip() {
    if (!updateInfo) return;
    await persistSettings({ ...settingsRef.current, dismissedUpdate: updateInfo.latestVersion });
    setUpdateInfo(null);
  }

  return (
    <>
      <nav
        className="nav"
        onDoubleClick={() => { void startDraggingCurrentWindow(); }}
      >
        <div className="nav-drag-zone" onMouseDown={() => { void startDraggingCurrentWindow(); }}>
          <span className="nav-brand">Sydney's Translator</span>
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
          loadedApiKey={loadedApiKey}
          autostartEnabled={autostartEnabled}
          error={settingsError}
          fetchedModels={fetchedModels}
          initialSettings={settings}
          isAlwaysOnTop={isAlwaysOnTop}
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

      {updateInfo?.hasUpdate && (
        <div className="modal-backdrop" role="presentation">
          <div aria-modal="true" className="modal-card" role="dialog">
            <h2 className="modal-title">{t(locale, 'update_title')}</h2>
            <p className="modal-body">
              {t(locale, 'update_body')} <strong>v{updateInfo.latestVersion}</strong>
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setUpdateInfo(null)}>
                {t(locale, 'update_remind_later')}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => { void handleUpdateSkip(); }}>
                {t(locale, 'update_skip_once')}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => { void handleUpdateNow(); }}>
                {t(locale, 'update_now')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
