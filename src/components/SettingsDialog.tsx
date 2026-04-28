import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fetchModels as fetchModelsIpc } from '../lib/ipc';
import { formatHotkeyForDisplay, hotkeyFromKeyboardEvent } from '../lib/hotkey';
import { t, type Locale } from '../lib/i18n';
import type { CloseButtonAction, SelectionMode, Settings, UiLanguage } from '../types/app';

export interface SettingsDialogValues {
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  globalHotkey: string;
  selectionMode: SelectionMode;
  uiLanguage: UiLanguage;
  closeButtonAction: CloseButtonAction;
}

interface SettingsPageProps {
  initialSettings: Settings;
  fetchedModels: string[];
  onFetchedModels: (models: string[]) => void;
  isSaving: boolean;
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

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
];

function buildInitialValues(settings: Settings): SettingsDialogValues {
  return {
    baseUrl: settings.baseUrl,
    apiKey: '',
    clearApiKey: false,
    model: settings.model,
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    globalHotkey: settings.globalHotkey,
    selectionMode: settings.selectionMode,
    uiLanguage: settings.uiLanguage ?? 'en',
    closeButtonAction: settings.closeButtonAction
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
  fetchedModels,
  onFetchedModels,
  isSaving,
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
  const fetchRef = useRef(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);
  const hotkeyInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedKeyRef = useRef('');

  useEffect(() => {
    const nextValues = buildInitialValues(initialSettings);
    setValues(nextValues);
    lastSavedKeyRef.current = JSON.stringify(nextValues);
    hydratedRef.current = true;
    setIsRecordingHotkey(false);
  }, [initialSettings]);

  const saveKey = useMemo(() => JSON.stringify(values), [values]);
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

  async function handleFetchModels() {
    const { baseUrl, apiKey } = values;
    const hasKey = apiKey.trim() || initialSettings.apiKeyPresent;
    if (!baseUrl.trim() || !hasKey) {
      setModelsError(t(locale, 'err_enter_url_key'));
      return;
    }
    const id = ++fetchRef.current;
    setModelsFetching(true);
    setModelsError(null);
    try {
      const models = await fetchModelsIpc(baseUrl, apiKey.trim());
      if (fetchRef.current !== id) return;
      onFetchedModels(models);
      if (models.length > 0 && !models.includes(values.model)) {
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

  return (
    <div className="page settings-page">
      <h1>{t(locale, 'settings_title')}</h1>
      <div>
        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_api')}</div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_base_url')}</span>
              <span className="settings-row-desc">{t(locale, 'desc_base_url')}</span>
            </div>
            <input className="settings-input" placeholder="https://api.openai.com/v1" type="text" value={values.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
          </div>
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_api_key')}</span>
              <span className="settings-row-desc">{initialSettings.apiKeyPresent ? t(locale, 'desc_api_key_set') : t(locale, 'desc_api_key_unset')}</span>
            </div>
            <input
              className="settings-input"
              placeholder={initialSettings.apiKeyPresent ? '••••••••' : 'sk-…'}
              type="password"
              value={values.apiKey}
              onChange={(e) => setValues((prev) => ({ ...prev, apiKey: e.target.value, clearApiKey: e.target.value.trim() ? false : prev.clearApiKey }))}
            />
          </div>
          {initialSettings.apiKeyPresent && (
            <div className="settings-row">
              <div className="settings-row-left">
                <span className="settings-row-label">{t(locale, 'label_clear_key')}</span>
                <span className="settings-row-desc">{t(locale, 'desc_clear_key')}</span>
              </div>
              <Toggle checked={values.clearApiKey} onChange={(v) => setValues((prev) => ({ ...prev, clearApiKey: v, apiKey: v ? '' : prev.apiKey }))} />
            </div>
          )}
          <div className="settings-row">
            <div className="settings-row-left">
              <span className="settings-row-label">{t(locale, 'label_model')}</span>
              {modelsError && <span className="settings-row-desc" style={{ color: 'var(--danger)' }}>{modelsError}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select className="settings-select" value={values.model} onChange={(e) => set('model', e.target.value)}>
                {[...new Set([...MODELS.map((m) => m.value), ...fetchedModels])].map((id) => {
                  const label = MODELS.find((m) => m.value === id)?.label ?? id;
                  return <option key={id} value={id}>{label}</option>;
                })}
              </select>
              <button className="btn btn-ghost" disabled={modelsFetching} type="button" onClick={handleFetchModels}>
                {modelsFetching ? '…' : t(locale, 'btn_refresh')}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">{t(locale, 'section_translation')}</div>
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
        </div>

        {(error || isSaving) && (
          <p className="settings-error">
            {error ? `⚠ ${error}` : t(locale, 'btn_saving')}
          </p>
        )}
      </div>
    </div>
  );
}
