import { createInitialState } from '../state/app-store';
import type { CloseButtonAction, Settings, ThemePreset, TranslationProvider } from '../types/app';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen<T>(event, (e) => handler(e.payload));
}

export interface SaveSettingsPayload {
  settings: Settings;
  apiKey: string;
  clearApiKey: boolean;
}

export interface HelperEvent {
  event: 'selection_text' | 'hotkey_trigger' | 'hotkey_error';
  text?: string;
  source?: 'selection' | 'hotkey';
}

export interface UpdateInfo {
  latestVersion: string;
  releaseUrl: string;
  hasUpdate: boolean;
}

interface PersistedVoiceProfile {
  id: string;
  name: string;
  type: string;
  preset_voice_id?: string;
  reference_audio_path?: string;
  language?: string;
  description?: string;
}

interface PersistedSettings {
  base_url: string;
  model: string;
  source_language: string;
  target_language: string;
  global_hotkey: string;
  selection_mode: string;
  ui_language: string;
  close_button_action?: CloseButtonAction;
  translation_provider?: TranslationProvider;
  theme_preset?: ThemePreset;
  custom_css?: string;
  auto_detect_zh_en_direction?: boolean;
  dismissed_update?: string;
  proxy_url?: string;
  tts_enabled?: boolean;
  tts_provider?: string;
  tts_auto_play?: boolean;
  tts_api_endpoint?: string;
  tts_default_voice_id?: string;
  tts_voice_profiles?: PersistedVoiceProfile[];
}

function normalizeThemePreset(themePreset?: string): Settings['themePreset'] {
  switch (themePreset) {
    case 'dark':
    case 'absolutely-light':
    case 'absolutely-dark':
    case 'light':
      return themePreset;
    case 'claude':
      return 'absolutely-dark';
    default:
      return 'light';
  }
}

function fromPersistedSettings(settings: PersistedSettings, apiKeyPresent: boolean): Settings {
  return {
    baseUrl: settings.base_url,
    apiKeyPresent,
    model: settings.model,
    sourceLanguage: settings.source_language,
    targetLanguage: settings.target_language,
    globalHotkey: settings.global_hotkey,
    selectionMode: settings.selection_mode as Settings['selectionMode'],
    uiLanguage: (settings.ui_language as Settings['uiLanguage']) ?? 'en',
    closeButtonAction: settings.close_button_action ?? 'ask',
    translationProvider: settings.translation_provider ?? 'ai',
    themePreset: normalizeThemePreset(settings.theme_preset),
    customCss: settings.custom_css ?? '',
    autoDetectZhEnDirection: settings.auto_detect_zh_en_direction ?? false,
    dismissedUpdate: settings.dismissed_update ?? '',
    proxyUrl: settings.proxy_url ?? '',
    ttsEnabled: settings.tts_enabled ?? false,
    ttsProvider: (settings.tts_provider as Settings['ttsProvider']) ?? 'mimo',
    ttsAutoPlay: settings.tts_auto_play ?? false,
    ttsApiEndpoint: settings.tts_api_endpoint ?? 'https://api.xiaomimimo.com/v1',
    ttsApiKeyPresent: false,
    ttsDefaultVoiceId: settings.tts_default_voice_id ?? '',
    ttsVoiceProfiles: (settings.tts_voice_profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as Settings['ttsVoiceProfiles'][number]['type'],
      presetVoiceId: p.preset_voice_id,
      referenceAudioPath: p.reference_audio_path,
      language: p.language,
      description: p.description,
    })),
  };
}

function toPersistedSettings(settings: Settings): PersistedSettings {
  return {
    base_url: settings.baseUrl,
    model: settings.model,
    source_language: settings.sourceLanguage,
    target_language: settings.targetLanguage,
    global_hotkey: settings.globalHotkey,
    selection_mode: settings.selectionMode,
    ui_language: settings.uiLanguage,
    close_button_action: settings.closeButtonAction,
    translation_provider: settings.translationProvider,
    theme_preset: settings.themePreset,
    custom_css: settings.customCss,
    auto_detect_zh_en_direction: settings.autoDetectZhEnDirection,
    dismissed_update: settings.dismissedUpdate,
    proxy_url: settings.proxyUrl,
    tts_enabled: settings.ttsEnabled,
    tts_provider: settings.ttsProvider,
    tts_auto_play: settings.ttsAutoPlay,
    tts_api_endpoint: settings.ttsApiEndpoint,
    tts_default_voice_id: settings.ttsDefaultVoiceId,
    tts_voice_profiles: settings.ttsVoiceProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      preset_voice_id: p.presetVoiceId ?? '',
      reference_audio_path: p.referenceAudioPath ?? '',
      language: p.language ?? '',
      description: p.description ?? '',
    })),
  };
}

export async function loadSettings(): Promise<{ settings: Settings; apiKey: string; ttsApiKey: string } | null> {
  if (!isTauri()) return null;
  const persisted = await invoke<{
    settings: PersistedSettings | null;
    api_key_present: boolean;
    api_key: string;
    tts_api_key_present: boolean;
    tts_api_key: string;
  }>('load_settings');

  const settings = persisted.settings
    ? fromPersistedSettings(persisted.settings, persisted.api_key_present)
    : { ...createInitialState().settings, apiKeyPresent: persisted.api_key_present };

  settings.ttsApiKeyPresent = persisted.tts_api_key_present;

  return { settings, apiKey: persisted.api_key, ttsApiKey: persisted.tts_api_key };
}

export async function loadApiKey(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>('load_api_key');
}

export async function saveSettingsWithApiKey(
  payload: SaveSettingsPayload
): Promise<Settings> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  const persisted = await invoke<{
    settings: PersistedSettings;
    api_key_present: boolean;
  }>('save_settings_with_api_key', {
    settings: toPersistedSettings(payload.settings),
    apiKey: payload.apiKey,
    clearApiKey: payload.clearApiKey
  });

  return fromPersistedSettings(persisted.settings, persisted.api_key_present);
}

export async function testConnection(baseUrl: string, apiKey: string, proxyUrl = ''): Promise<number> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  return invoke<number>('test_connection', { baseUrl, apiKey, proxyUrl });
}

export async function fetchModels(baseUrl: string, apiKey: string, proxyUrl = ''): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>('fetch_models', { baseUrl, apiKey, proxyUrl });
}

export async function translateText(
  baseUrl: string,
  apiKey: string,
  model: string,
  sourceLanguage: string,
  targetLanguage: string,
  text: string,
  provider: TranslationProvider = 'ai',
  proxyUrl = ''
): Promise<void> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  return invoke<void>('translate', { baseUrl, apiKey, model, sourceLanguage, targetLanguage, text, provider, proxyUrl });
}

export async function checkForUpdate(currentVersion: string, dismissedVersion: string): Promise<UpdateInfo> {
  if (!isTauri()) return { latestVersion: '', releaseUrl: '', hasUpdate: false };
  const result = await invoke<{ latest_version: string; release_url: string; has_update: boolean }>(
    'check_for_update', { currentVersion, dismissedVersion }
  );
  return {
    latestVersion: result.latest_version,
    releaseUrl: result.release_url,
    hasUpdate: result.has_update,
  };
}

export async function listenToTranslationChunks(
  handler: (chunk: string) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<string>('translation-chunk', (chunk) => handler(chunk));
}

export async function setAlwaysOnTop(enable: boolean): Promise<void> {
  if (!isTauri()) return;
  return invoke<void>('set_always_on_top', { enable });
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('get_autostart_enabled');
}

export async function setAutostartEnabled(enable: boolean): Promise<void> {
  if (!isTauri()) return;
  return invoke<void>('set_autostart_enabled', { enable });
}

export async function reloadHelper(): Promise<void> {
  if (!isTauri()) return;
  await invoke('reload_helper');
}

export async function minimizeCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().minimize();
}

export async function hideCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().hide();
}

export async function startDraggingCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}

export async function exitApplication(): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>('exit_application');
}

export async function listenToOpenSettings(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<void>('open-settings', () => handler());
}

export async function listenToHelperEvents(
  handler: (event: HelperEvent) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  return listen<HelperEvent>('helper-event', (payload) => handler(payload));
}

export async function openUrl(url: string): Promise<void> {
  window.open(url, '_blank');
}

export async function getLogPath(): Promise<string> {
  if (!isTauri()) return '';
  return invoke<string>('get_log_path');
}

export interface VoiceProfileParam {
  id: string;
  name: string;
  type: 'preset' | 'clone';
  presetVoiceId?: string;
  referenceAudioPath?: string;
}

export async function synthesizeSpeech(
  text: string,
  voiceProfile: VoiceProfileParam,
  ttsProvider: string,
  ttsApiEndpoint: string,
  ttsApiKey: string,
): Promise<string> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  return invoke<string>('synthesize_speech', {
    text,
    voiceProfile: {
      id: voiceProfile.id,
      name: voiceProfile.name,
      type: voiceProfile.type,
      preset_voice_id: voiceProfile.presetVoiceId ?? '',
      reference_audio_path: voiceProfile.referenceAudioPath ?? '',
    },
    ttsProvider,
    ttsApiEndpoint,
    ttsApiKey,
  });
}

export async function saveTtsApiKey(apiKey: string): Promise<void> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  await invoke<void>('save_tts_api_key_command', { apiKey });
}

export async function loadTtsApiKey(): Promise<string> {
  if (!isTauri()) return '';
  return invoke<string>('load_tts_api_key');
}

export async function pickAudioFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac', 'm4a'] }],
  });
  return selected ?? null;
}
