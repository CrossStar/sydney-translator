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
    api_key_present: true
  });

  await expect(loadSettings()).resolves.toEqual({
    baseUrl: '',
    apiKeyPresent: true,
    model: '',
    sourceLanguage: 'auto',
    targetLanguage: 'English',
    globalHotkey: 'ctrl+shift+t',
    selectionMode: 'hotkey',
    uiLanguage: 'en',
    closeButtonAction: 'ask'
  });
});
