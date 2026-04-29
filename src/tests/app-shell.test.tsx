import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import {
  checkForUpdate,
  exitApplication,
  fetchModels,
  getAutostartEnabled,
  hideCurrentWindow,
  listenToHelperEvents,
  listenToOpenSettings,
  loadSettings,
  minimizeCurrentWindow,
  openUrl,
  reloadHelper,
  saveSettingsWithApiKey,
  setAlwaysOnTop,
  setAutostartEnabled,
  startDraggingCurrentWindow,
  translateText
} from '../lib/ipc';

type HelperEvent = {
  event: 'selection_text' | 'hotkey_trigger';
  text?: string;
  source?: 'selection' | 'hotkey';
};

const baseSettings = {
  baseUrl: 'https://api.example.com/v1',
  apiKeyPresent: true,
  model: 'gpt-5-mini',
  sourceLanguage: 'auto',
  targetLanguage: 'English',
  globalHotkey: 'ctrl+shift+t',
  selectionMode: 'hotkey' as const,
  uiLanguage: 'en' as const,
  closeButtonAction: 'ask' as const,
  translationProvider: 'ai' as const,
  themePreset: 'light' as const,
  customCss: '',
  dismissedUpdate: '',
  proxyUrl: ''
};

let helperEventListener: ((payload: { payload: HelperEvent }) => void) | null = null;
let openSettingsListener: (() => void) | null = null;
let translationChunkListener: ((payload: { payload: string }) => void) | null = null;

vi.mock('../lib/ipc', () => ({
  checkForUpdate: vi.fn(async () => ({ latestVersion: '', releaseUrl: '', hasUpdate: false })),
  exitApplication: vi.fn(async () => {}),
  fetchModels: vi.fn(async () => []),
  getAutostartEnabled: vi.fn(async () => false),
  hideCurrentWindow: vi.fn(async () => {}),
  listenToHelperEvents: vi.fn(async (handler: (event: HelperEvent) => void) => {
    helperEventListener = (payload) => handler(payload.payload);
    return vi.fn();
  }),
  listenToOpenSettings: vi.fn(async (handler: () => void) => {
    openSettingsListener = handler;
    return vi.fn();
  }),
  listenToTranslationChunks: vi.fn(async (handler: (chunk: string) => void) => {
    translationChunkListener = (payload) => handler(payload.payload);
    return vi.fn();
  }),
  loadSettings: vi.fn(),
  minimizeCurrentWindow: vi.fn(async () => {}),
  openUrl: vi.fn(async () => {}),
  reloadHelper: vi.fn(),
  saveSettingsWithApiKey: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setAutostartEnabled: vi.fn(),
  startDraggingCurrentWindow: vi.fn(async () => {}),
  translateText: vi.fn(async () => {})
}));

const mockedCheckForUpdate = vi.mocked(checkForUpdate);
const mockedExitApplication = vi.mocked(exitApplication);
const mockedFetchModels = vi.mocked(fetchModels);
const mockedGetAutostartEnabled = vi.mocked(getAutostartEnabled);
const mockedHideCurrentWindow = vi.mocked(hideCurrentWindow);
const mockedListenToHelperEvents = vi.mocked(listenToHelperEvents);
const mockedListenToOpenSettings = vi.mocked(listenToOpenSettings);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedMinimizeCurrentWindow = vi.mocked(minimizeCurrentWindow);
const mockedOpenUrl = vi.mocked(openUrl);
const mockedReloadHelper = vi.mocked(reloadHelper);
const mockedSaveSettingsWithApiKey = vi.mocked(saveSettingsWithApiKey);
const mockedSetAlwaysOnTop = vi.mocked(setAlwaysOnTop);
const mockedSetAutostartEnabled = vi.mocked(setAutostartEnabled);
const mockedStartDraggingCurrentWindow = vi.mocked(startDraggingCurrentWindow);
const mockedTranslateText = vi.mocked(translateText);

function mockHelperEvent(payload: HelperEvent) {
  if (!helperEventListener) {
    throw new Error('helper event listener has not been registered');
  }

  helperEventListener({ payload });
}

function pushTranslationChunk(chunk: string) {
  if (!translationChunkListener) {
    throw new Error('translation chunk listener has not been registered');
  }

  translationChunkListener({ payload: chunk });
}

function triggerOpenSettings() {
  if (!openSettingsListener) {
    throw new Error('open settings listener has not been registered');
  }

  openSettingsListener();
}

beforeEach(() => {
  helperEventListener = null;
  openSettingsListener = null;
  translationChunkListener = null;
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('translator-custom-css')?.remove();

  mockedCheckForUpdate.mockReset();
  mockedCheckForUpdate.mockResolvedValue({ latestVersion: '', releaseUrl: '', hasUpdate: false });
  mockedExitApplication.mockReset();
  mockedExitApplication.mockResolvedValue();
  mockedFetchModels.mockReset();
  mockedFetchModels.mockResolvedValue([]);
  mockedGetAutostartEnabled.mockReset();
  mockedGetAutostartEnabled.mockResolvedValue(false);
  mockedHideCurrentWindow.mockReset();
  mockedHideCurrentWindow.mockResolvedValue();
  mockedListenToHelperEvents.mockClear();
  mockedListenToOpenSettings.mockClear();
  mockedLoadSettings.mockReset();
  mockedLoadSettings.mockResolvedValue(null);
  mockedMinimizeCurrentWindow.mockReset();
  mockedMinimizeCurrentWindow.mockResolvedValue();
  mockedOpenUrl.mockReset();
  mockedOpenUrl.mockResolvedValue();
  mockedReloadHelper.mockReset();
  mockedReloadHelper.mockResolvedValue();
  mockedSaveSettingsWithApiKey.mockReset();
  mockedSaveSettingsWithApiKey.mockImplementation(async ({ settings }) => settings);
  mockedSetAlwaysOnTop.mockReset();
  mockedSetAlwaysOnTop.mockResolvedValue();
  mockedSetAutostartEnabled.mockReset();
  mockedSetAutostartEnabled.mockResolvedValue();
  mockedStartDraggingCurrentWindow.mockReset();
  mockedStartDraggingCurrentWindow.mockResolvedValue();
  mockedTranslateText.mockReset();
  mockedTranslateText.mockImplementation(async () => {
    pushTranslationChunk('translated');
  });
});

it('hydrates the input when a selection helper event arrives', async () => {
  render(<App />);

  await waitFor(() => {
    expect(mockedListenToHelperEvents).toHaveBeenCalledTimes(1);
  });

  await act(async () => {
    mockHelperEvent({ event: 'selection_text', text: 'selected text', source: 'selection' });
  });

  expect(await screen.findByDisplayValue('selected text')).toBeInTheDocument();
  expect(mockedTranslateText).not.toHaveBeenCalled();
});

it('auto-translates selection text when valid settings are loaded', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: { ...baseSettings, targetLanguage: 'Chinese', selectionMode: 'auto-popup' },
    apiKey: ''
  });

  render(<App />);

  await waitFor(() => {
    expect(mockedLoadSettings).toHaveBeenCalledTimes(1);
  });

  await act(async () => {
    mockHelperEvent({ event: 'selection_text', text: 'selected text', source: 'selection' });
  });

  await waitFor(() => {
    expect(mockedTranslateText).toHaveBeenCalledWith(
      'https://api.example.com/v1',
      '',
      'gpt-5-mini',
      'auto',
      'Chinese',
      'selected text',
      'ai',
      ''
    );
  });
});

it('applies the saved theme preset and custom css on load', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: {
      ...baseSettings,
      themePreset: 'absolutely-dark',
      customCss: ':root { --accent: rgb(1, 2, 3); }'
    },
    apiKey: ''
  });

  render(<App />);

  await waitFor(() => {
    expect(document.documentElement.getAttribute('data-theme')).toBe('absolutely-dark');
  });

  expect(document.getElementById('translator-custom-css')?.textContent).toBe(':root { --accent: rgb(1, 2, 3); }');
});

it('auto-saves theme changes from settings', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByDisplayValue('Default Light'), {
    target: { value: 'dark' }
  });

  await waitFor(() => {
    expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ themePreset: 'dark', customCss: '' })
      })
    );
  });

  await waitFor(() => {
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

it('updates injected custom css when the textarea changes', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByPlaceholderText(':root { --accent: #c27a44; }'), {
    target: { value: ':root { --bg: #111; }' }
  });

  await waitFor(() => {
    expect(document.getElementById('translator-custom-css')?.textContent).toBe(':root { --bg: #111; }');
  });
});

it('opens the settings page when the tray settings event arrives', async () => {
  render(<App />);

  await waitFor(() => {
    expect(mockedListenToOpenSettings).toHaveBeenCalledTimes(1);
  });

  await act(async () => {
    triggerOpenSettings();
  });

  expect(await screen.findByText('API Configuration')).toBeInTheDocument();
});

it('disables translate when input is empty', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Translate →' })).toBeDisabled();
});

it('shows the translation placeholder area', () => {
  render(<App />);
  expect(screen.getByText('Translation will appear here…')).toBeInTheDocument();
});

it('renders streamed output after translating with valid settings', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: { ...baseSettings, targetLanguage: 'Chinese' },
    apiKey: ''
  });
  mockedTranslateText.mockImplementationOnce(async () => {
    pushTranslationChunk('bon');
    pushTranslationChunk('jour');
  });

  render(<App />);

  await waitFor(() => {
    expect(mockedLoadSettings).toHaveBeenCalledTimes(1);
  });

  fireEvent.change(screen.getByRole('textbox', { name: 'Source text' }), {
    target: { value: 'hello' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Translate →' }));

  await waitFor(() => {
    expect(mockedTranslateText).toHaveBeenCalledWith(
      'https://api.example.com/v1',
      '',
      'gpt-5-mini',
      'auto',
      'Chinese',
      'hello',
      'ai',
      ''
    );
  });

  expect(await screen.findByText('bonjour')).toBeInTheDocument();
});

it('shows a validation error before sending when required settings are missing', async () => {
  render(<App />);

  fireEvent.change(screen.getByRole('textbox', { name: 'Source text' }), {
    target: { value: 'hello' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Translate →' }));

  expect(await screen.findByText('⚠ Base URL is required.')).toBeInTheDocument();
  expect(mockedTranslateText).not.toHaveBeenCalled();
});

it('shows a settings error message when auto-save fails', async () => {
  mockedSaveSettingsWithApiKey.mockRejectedValueOnce(new Error('Save failed.'));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), {
    target: { value: 'https://api.example.com/v1' }
  });

  await screen.findByText('⚠ Save failed.');
  await waitFor(() => expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledTimes(1));
});

it('auto-saves settings when the user edits fields', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.change(screen.getByPlaceholderText('https://api.openai.com/v1'), {
    target: { value: 'https://api.example.com/v1' }
  });

  await waitFor(() => {
    expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledWith({
      settings: {
        baseUrl: 'https://api.example.com/v1',
        apiKeyPresent: false,
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
      apiKey: '',
      clearApiKey: false
    });
  });
});

it('keeps a manually entered model after refresh and saves the typed value', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: baseSettings,
    apiKey: ''
  });
  mockedFetchModels.mockResolvedValueOnce(['gpt-5-mini', 'gpt-5']);

  render(<App />);

  await waitFor(() => {
    expect(mockedLoadSettings).toHaveBeenCalledTimes(1);
  });

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  await screen.findByText('API Configuration');

  const modelInput = document.querySelector('input[list="model-suggestions"]') as HTMLInputElement;
  fireEvent.change(modelInput, { target: { value: 'custom-model' } });
  fireEvent.click(screen.getByRole('button', { name: '↻' }));

  await waitFor(() => {
    expect(mockedFetchModels).toHaveBeenCalledTimes(1);
  });

  expect(modelInput).toHaveValue('custom-model');

  await waitFor(() => {
    expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ model: 'custom-model' })
      })
    );
  });
});

it('minimizes the frameless window from the minimize button', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }));

  await waitFor(() => {
    expect(mockedMinimizeCurrentWindow).toHaveBeenCalledTimes(1);
  });
});

it('shows close prompt when close button action is ask', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(mockedHideCurrentWindow).not.toHaveBeenCalled();
  expect(mockedExitApplication).not.toHaveBeenCalled();
});

it('hides the window when minimize to tray is chosen from close prompt', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Minimize to Tray' }));

  await waitFor(() => {
    expect(mockedHideCurrentWindow).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('exits the app when exit app is chosen from close prompt', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Exit App' }));

  await waitFor(() => {
    expect(mockedExitApplication).toHaveBeenCalledTimes(1);
  });
});

it('persists close action when remember is checked', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Minimize to Tray' }));

  await waitFor(() => {
    expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ closeButtonAction: 'hide' })
      })
    );
  });
});

it('skips close prompt when action is already hide', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: { ...baseSettings, closeButtonAction: 'hide' },
    apiKey: ''
  });

  render(<App />);
  await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

  await waitFor(() => {
    expect(mockedHideCurrentWindow).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('skips close prompt and exits when action is already exit', async () => {
  mockedLoadSettings.mockResolvedValueOnce({
    settings: { ...baseSettings, closeButtonAction: 'exit' },
    apiKey: ''
  });

  render(<App />);
  await waitFor(() => expect(mockedLoadSettings).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: 'Close window' }));

  await waitFor(() => {
    expect(mockedExitApplication).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('records a hotkey when a key combination is pressed in the hotkey field', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

  const hotkeyInput = await screen.findByRole('textbox', { name: 'Global Hotkey' });
  fireEvent.click(hotkeyInput);
  fireEvent.keyDown(hotkeyInput, { key: 'a', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false });

  await waitFor(() => {
    expect(mockedSaveSettingsWithApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ globalHotkey: 'ctrl+a' })
      })
    );
  });
});

it('starts dragging when the title bar drag zone is pressed', async () => {
  render(<App />);

  fireEvent.mouseDown(screen.getByText("Sydney's Translator"));

  await waitFor(() => {
    expect(mockedStartDraggingCurrentWindow).toHaveBeenCalledTimes(1);
  });
});
