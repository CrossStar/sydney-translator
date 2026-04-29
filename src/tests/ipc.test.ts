import { beforeEach, expect, it, vi } from 'vitest';
import { loadSettings } from '../lib/ipc';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}));

beforeEach(() => {
  invokeMock.mockReset();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    configurable: true
  });
});

it('preserves api key presence when only the secret exists', async () => {
  invokeMock.mockResolvedValueOnce({
    settings: null,
    api_key_present: true,
    api_key: 'sk-abcdefgh'
  });

  await expect(loadSettings()).resolves.toEqual({
    settings: {
      baseUrl: '',
      apiKeyPresent: true,
      model: '',
      sourceLanguage: 'auto',
      targetLanguage: 'English',
      globalHotkey: 'ctrl+shift+t',
      selectionMode: 'hotkey',
      uiLanguage: 'en',
      closeButtonAction: 'ask',
      translationProvider: 'ai',
      themePreset: 'light',
      customCss: '',
      dismissedUpdate: '',
      proxyUrl: ''
    },
    apiKey: 'sk-abcdefgh'
  });
});

it('maps legacy claude preset to absolutely dark on load', async () => {
  invokeMock.mockResolvedValueOnce({
    settings: {
      base_url: 'https://api.example.com/v1',
      model: 'gpt-5-mini',
      source_language: 'auto',
      target_language: 'English',
      global_hotkey: 'ctrl+shift+t',
      selection_mode: 'hotkey',
      ui_language: 'en',
      close_button_action: 'ask',
      translation_provider: 'ai',
      theme_preset: 'claude',
      custom_css: '',
      dismissed_update: '',
      proxy_url: ''
    },
    api_key_present: false,
    api_key: ''
  });

  await expect(loadSettings()).resolves.toEqual({
    settings: {
      baseUrl: 'https://api.example.com/v1',
      apiKeyPresent: false,
      model: 'gpt-5-mini',
      sourceLanguage: 'auto',
      targetLanguage: 'English',
      globalHotkey: 'ctrl+shift+t',
      selectionMode: 'hotkey',
      uiLanguage: 'en',
      closeButtonAction: 'ask',
      translationProvider: 'ai',
      themePreset: 'absolutely-dark',
      customCss: '',
      dismissedUpdate: '',
      proxyUrl: ''
    },
    apiKey: ''
  });
});
