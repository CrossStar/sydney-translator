import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fetchModels as fetchModelsIpc, testConnection as testConnectionIpc } from '../lib/ipc';
import { formatHotkeyForDisplay, hotkeyFromKeyboardEvent } from '../lib/hotkey';
import { t, type Locale } from '../lib/i18n';
import type { CloseButtonAction, SelectionMode, Settings, ThemePreset, TranslationProvider, UiLanguage } from '../types/app';

export interface SettingsDialogValues {
  baseUrl: string;
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  globalHotkey: string;
  selectionMode: SelectionMode;
  uiLanguage: UiLanguage;
  closeButtonAction: CloseButtonAction;
  translationProvider: TranslationProvider;
  themePreset: ThemePreset;
  customCss: string;
  proxyUrl: string;
}

interface SettingsPageProps {
  initialSettings: Settings;
  loadedApiKey: string;
  fetchedModels: string[];
  onFetchedModels: (models: string[]) => void;
  error: string | null;
  locale: Locale;
  isAlwaysOnTop: boolean;
  autostartEnabled: boolean;
  onSave: (values: SettingsDialogValues) => Promise<void>;
  onToggleAlwaysOnTop: () => void;
  onToggleAutostart: () => void;
}

const LANGUAGES = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'Chinese', label: 'Chinese (中文)' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: 'Japanese (日本語)' },
  { value: 'Korean', label: 'Korean (한국어)' },
  { value: 'French', label: 'French (Français)' },
  { value: 'German', label: 'German (Deutsch)' },
  { value: 'Spanish', label: 'Spanish (Español)' },
  { value: 'Portuguese', label: 'Portuguese (Português)' },
  { value: 'Russian', label: 'Russian (Русский)' },
  { value: 'Arabic', label: 'Arabic (العربية)' },
  { value: 'Italian', label: 'Italian (Italiano)' },
  { value: 'Dutch', label: 'Dutch (Nederlands)' },
  { value: 'Polish', label: 'Polish (Polski)' },
  { value: 'Turkish', label: 'Turkish (Türkçe)' },
  { value: 'Vietnamese', label: 'Vietnamese (Tiếng Việt)' },
  { value: 'Thai', label: 'Thai (ภาษาไทย)' }
];

const DEFAULT_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001'
];

function buildInitialValues(settings: Settings): SettingsDialogValues {
  return {
    baseUrl: settings.baseUrl,
    apiKey: '',
    model: settings.model,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    globalHotkey: settings.globalHotkey,
    selectionMode: settings.selectionMode,
    uiLanguage: settings.uiLanguage ?? 'en',
    closeButtonAction: settings.closeButtonAction,
    translationProvider: settings.translationProvider ?? 'ai',
    themePreset: settings.themePreset ?? 'light',
    customCss: settings.customCss ?? '',
    proxyUrl: settings.proxyUrl ?? '',
  };
}

function buildSaveKey(values: SettingsDialogValues): string {
  const { apiKey: _apiKey, ...rest } = values;
  return JSON.stringify(rest);
}

function mergeInitialValues(
  settings: Settings,
  previousValues: SettingsDialogValues,
  loadedApiKey: string,
  apiKeyHydrated: boolean
): SettingsDialogValues {
  const nextValues = buildInitialValues(settings);
  return {
    ...nextValues,
    apiKey: apiKeyHydrated ? previousValues.apiKey : (loadedApiKey || previousValues.apiKey),
  };
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      <span className="toggle-thumb" />
    </label>
  );
}

export function SettingsDialog({
  initialSettings,
  loadedApiKey,
  fetchedModels,
  onFetchedModels,
  error,
  locale,
  isAlwaysOnTop,
  autostartEnabled,
  onSave,
  onToggleAlwaysOnTop,
  onToggleAutostart
}: SettingsPageProps) {
  const [values, setValues] = useState<SettingsDialogValues>(() => buildInitialValues(initialSettings));
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const fetchRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const hotkeyInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedKeyRef = useRef('');

  const apiKeyHydratedRef = useRef(false);

  useEffect(() => {
    setValues((prev) => {
      const nextValues = mergeInitialValues(initialSettings, prev, loadedApiKey, apiKeyHydratedRef.current);
      lastSavedKeyRef.current = buildSaveKey(nextValues);
      return nextValues;
    });
    if (!apiKeyHydratedRef.current && loadedApiKey) {
      apiKeyHydratedRef.current = true;
    }
    hydratedRef.current = true;
    setIsRecordingHotkey(false);
  }, [initialSettings, loadedApiKey]);

  const saveKey = useMemo(() => buildSaveKey(values), [values]);
  const modelSuggestions = useMemo(() => {
    const base = fetchedModels.length > 0 ? fetchedModels : DEFAULT_MODELS;
    return values.model && !base.includes(values.model)
      ? [values.model, ...base]
      : base;
  }, [fetchedModels, values.model]);
  const hotkeyDisplayValue = isRecordingHotkey
    ? t(locale, 'hotkey_recording')
    : formatHotkeyForDisplay(values.globalHotkey);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveKey === lastSavedKeyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      lastSavedKeyRef.current = saveKey;
      void onSave(values).catch(() => { /* error surfaced via App's settingsError state */ });
    }, 400);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [onSave, saveKey, values]);

  useEffect(() => {
    if (!isRecordingHotkey) return;
    hotkeyInputRef.current?.focus();
    hotkeyInputRef.current?.select();
  }, [isRecordingHotkey]);

  function set<K extends keyof SettingsDialogValues>(key: K, value: SettingsDialogValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTestConnection() {
    const { baseUrl, apiKey, proxyUrl } = values;
    const hasKey = apiKey.trim() || initialSettings.apiKeyPresent;
    if (!baseUrl.trim() || !hasKey) {
      setTestStatus('fail');
      setTestMessage(t(locale, 'err_enter_url_key'));
      return;
    }
    setTestStatus('testing');
    setTestMessage('');
    try {
      const ms = await testConnectionIpc(baseUrl, apiKey.trim(), proxyUrl);
      setTestStatus('ok');
      setTestMessage(`${t(locale, 'test_connection_ok')} (${ms}ms)`);
    } catch (err) {
      setTestStatus('fail');
      setTestMessage(`${t(locale, 'test_connection_fail')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleFetchModels() {
    const { baseUrl, apiKey, proxyUrl } = values;
    const hasKey = apiKey.trim() || initialSettings.apiKeyPresent;
    if (!baseUrl.trim() || !hasKey) {
      setModelsError(t(locale, 'err_enter_url_key'));
      return;
    }
    const id = ++fetchRef.current;
    setModelsFetching(true);
    setModelsError(null);
    try {
      const models = await fetchModelsIpc(baseUrl, apiKey.trim(), proxyUrl);
      if (fetchRef.current !== id) return;
      onFetchedModels(models);
      if (models.length > 0 && !values.model.trim()) {
        set('model', models[0]);
      }
    } catch (err) {
      if (fetchRef.current !== id) return;
      setModelsError(err instanceof Error ? err.message : t(locale, 'err_fetch_models'));
    } finally {
      if (fetchRef.current === id) setModelsFetching(false);
    }
  }

  function handleHotkeyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsRecordingHotkey(false);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      return;
    }

    const nextHotkey = hotkeyFromKeyboardEvent(event.nativeEvent);
    if (!nextHotkey) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    set('globalHotkey', nextHotkey);
    setIsRecordingHotkey(false);
  }

  const isAiProvider = values.translationProvider === 'ai';

  return (
    <div className="page settings-page">
      <h1>{t(locale, 'settings_title')}</h1>
      <div>
        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_translation')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_provider')}</span>
            </div>
            <select className="settings-select" value={values.translationProvider} onChange={(e) => set('translationProvider', e.target.value as TranslationProvider)}>
              <option value="ai">{t(locale, 'option_provider_ai')}</option>
              <option value="bing">{t(locale, 'option_provider_bing')}</option>
              <option value="google">{t(locale, 'option_provider_google')}</option>
            </select>
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_source_lang')}</span>
            </div>
            <select className="settings-select" value={values.sourceLanguage} onChange={(e) => set('sourceLanguage', e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_target_lang')}</span>
            </div>
            <select className="settings-select" value={values.targetLanguage} onChange={(e) => set('targetLanguage', e.target.value)}>
              {LANGUAGES.filter((l) => l.value !== 'auto').map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {isAiProvider && (
          <div className="settings-section">
            <div className="settings-section-title">{t(locale, 'section_api')}</div>
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">{t(locale, 'label_base_url')}</span>
                <span className="settings-row-desc">{t(locale, 'desc_base_url')}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input className="settings-input" placeholder="https://api.openai.com/v1" type="text" value={values.baseUrl} onChange={(e) => { set('baseUrl', e.target.value); setTestStatus('idle'); }} />
                <button
                  className={`btn btn-ghost test-btn test-btn--${testStatus}`}
                  disabled={testStatus === 'testing'}
                  type="button"
                  onClick={handleTestConnection}
                >
                  {testStatus === 'testing' ? '…' : t(locale, 'btn_test_connection')}
                </button>
              </div>
            </div>
            {testMessage && (
              <div className={`settings-test-result settings-test-result--${testStatus}`}>
                {testMessage}
              </div>
            )}
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">{t(locale, 'label_api_key')}</span>
              </div>
              <div className="settings-input-eye-wrap">
                <input
                  className="settings-input settings-input-eye"
                  placeholder="sk-xxxx"
                  type={showApiKey ? 'text' : 'password'}
                  value={values.apiKey}
                  onChange={(e) => setValues((prev) => ({ ...prev, apiKey: e.target.value }))}
                  onBlur={() => {
                    if (values.apiKey.trim()) void onSave(values).catch(() => {});
                  }}
                />
                {values.apiKey && (
                  <button
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="eye-btn"
                    tabIndex={-1}
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                  >
                    {showApiKey ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">{t(locale, 'label_model')}</span>
                {modelsError && <span className="settings-row-desc" style={{ color: 'var(--danger)' }}>{modelsError}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <>
                  <input
                    className="settings-input"
                    list="model-suggestions"
                    type="text"
                    value={values.model}
                    onChange={(e) => set('model', e.target.value)}
                  />
                  <datalist id="model-suggestions">
                    {modelSuggestions.map((id) => <option key={id} value={id} />)}
                  </datalist>
                </>
                <button className="btn btn-ghost" disabled={modelsFetching} type="button" onClick={handleFetchModels}>
                  {modelsFetching ? '…' : t(locale, 'btn_refresh')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_triggers')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_hotkey')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_hotkey')}</span>
            </div>
            <div className="settings-hotkey-field">
              <input
                ref={hotkeyInputRef}
                aria-label={t(locale, 'label_hotkey')}
                className={`settings-input settings-hotkey-input${isRecordingHotkey ? ' recording' : ''}`}
                readOnly
                type="text"
                value={hotkeyDisplayValue}
                onBlur={() => setIsRecordingHotkey(false)}
                onClick={() => setIsRecordingHotkey(true)}
                onKeyDown={handleHotkeyKeyDown}
              />
              <span id="hotkey-recording-hint" className="settings-row-desc settings-hotkey-hint">
                {isRecordingHotkey ? t(locale, 'hotkey_recording_hint') : t(locale, 'hotkey_idle_hint')}
              </span>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_selection_mode')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_selection_mode')}</span>
            </div>
            <select className="settings-select" value={values.selectionMode} onChange={(e) => set('selectionMode', e.target.value as SelectionMode)}>
              <option value="hotkey">{t(locale, 'option_hotkey_only')}</option>
              <option value="auto-popup">{t(locale, 'option_auto_popup')}</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_appearance')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_theme_preset')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_theme_preset')}</span>
            </div>
            <select className="settings-select" value={values.themePreset} onChange={(e) => set('themePreset', e.target.value as ThemePreset)}>
              <option value="light">{t(locale, 'option_theme_light')}</option>
              <option value="dark">{t(locale, 'option_theme_dark')}</option>
              <option value="absolutely-light">{t(locale, 'option_theme_absolutely_light')}</option>
              <option value="absolutely-dark">{t(locale, 'option_theme_absolutely_dark')}</option>
            </select>
          </div>
          <div className="settings-row settings-row-textarea">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_custom_css')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_custom_css')}</span>
            </div>
            <textarea
              className="settings-textarea"
              placeholder=":root { --accent: #c27a44; }"
              value={values.customCss}
              onChange={(e) => set('customCss', e.target.value.slice(0, 50000))}
            />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_window')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_always_on_top')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_always_on_top')}</span>
            </div>
            <Toggle checked={isAlwaysOnTop} onChange={onToggleAlwaysOnTop} />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_system')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_autostart')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_autostart')}</span>
            </div>
            <Toggle checked={autostartEnabled} onChange={onToggleAutostart} />
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_ui_language')}</span>
            </div>
            <select className="settings-select" value={values.uiLanguage} onChange={(e) => set('uiLanguage', e.target.value as UiLanguage)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_proxy')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_proxy')}</span>
            </div>
            <input
              className="settings-input"
              placeholder="http://127.0.0.1:7890"
              type="text"
              value={values.proxyUrl}
              onChange={(e) => set('proxyUrl', e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="settings-error">
            {`⚠ ${error}`}
          </p>
        )}
      </div>
    </div>
  );
}
