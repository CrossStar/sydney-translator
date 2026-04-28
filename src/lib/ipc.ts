import { createInitialState } from '../state/app-store';
import type { CloseButtonAction, Settings } from '../types/app';

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

interface PersistedSettings {
  base_url: string;
  model: string;
  source_language: string;
  target_language: string;
  global_hotkey: string;
  selection_mode: string;
  ui_language: string;
  close_button_action?: CloseButtonAction;
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
  };
}

export async function loadSettings(): Promise<Settings | null> {
  if (!isTauri()) return null;
  const persisted = await invoke<{
    settings: PersistedSettings | null;
    api_key_present: boolean;
  }>('load_settings');

  if (!persisted.settings) {
    return {
      ...createInitialState().settings,
      apiKeyPresent: persisted.api_key_present
    };
  }

  return fromPersistedSettings(persisted.settings, persisted.api_key_present);
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

export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!isTauri()) return [];
  return invoke<string[]>('fetch_models', { baseUrl, apiKey });
}

export async function translateText(
  baseUrl: string,
  apiKey: string,
  model: string,
  sourceLanguage: string,
  targetLanguage: string,
  text: string
): Promise<void> {
  if (!isTauri()) throw new Error('Not running in Tauri.');
  return invoke<void>('translate', { baseUrl, apiKey, model, sourceLanguage, targetLanguage, text });
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
