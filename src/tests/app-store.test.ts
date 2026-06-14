import { describe, expect, it } from 'vitest';
import { createInitialState, reduceHelperEvent, resolveEffectiveLanguages, validateSettings } from '../state/app-store';

describe('createInitialState', () => {
  it('returns expected settings defaults', () => {
    const { settings } = createInitialState();

    expect(settings).toEqual({
      baseUrl: '',
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
      autoDetectZhEnDirection: false,
      dismissedUpdate: '',
      proxyUrl: '',
      ttsEnabled: false,
      ttsProvider: 'webspeech',
      ttsAutoPlay: false,
      ttsApiEndpoint: 'https://api.xiaomimimo.com/v1',
      ttsApiKeyPresent: false,
      ttsDefaultVoiceId: '',
      ttsVoiceProfiles: [],
    });
  });

  it('returns expected translation defaults', () => {
    const { translation } = createInitialState();

    expect(translation).toEqual({
      input: '',
      output: '',
      lastTrigger: null,
      notice: null,
      isLoading: false,
      error: null
    });
  });
});

describe('reduceHelperEvent', () => {
  it('hydrates input and clears notice for selection events', () => {
    const next = reduceHelperEvent(
      {
        ...createInitialState().translation,
        notice: 'Clipboard captured.'
      },
      {
        event: 'selection_text',
        text: 'selected text',
        source: 'selection'
      }
    );

    expect(next.input).toBe('selected text');
    expect(next.lastTrigger).toBe('selection');
    expect(next.notice).toBeNull();
  });
});

describe('resolveEffectiveLanguages', () => {
  it('returns Chinese to English when the toggle is enabled and input is Chinese', () => {
    const { settings } = createInitialState();
    settings.autoDetectZhEnDirection = true;

    expect(resolveEffectiveLanguages(settings, '你好，世界')).toEqual({
      sourceLanguage: 'Chinese',
      targetLanguage: 'English'
    });
  });

  it('returns English to Chinese when the toggle is enabled and input is English', () => {
    const { settings } = createInitialState();
    settings.autoDetectZhEnDirection = true;

    expect(resolveEffectiveLanguages(settings, 'hello world')).toEqual({
      sourceLanguage: 'English',
      targetLanguage: 'Chinese'
    });
  });

  it('falls back to configured languages when detection is ambiguous', () => {
    const { settings } = createInitialState();
    settings.autoDetectZhEnDirection = true;
    settings.sourceLanguage = 'Japanese';
    settings.targetLanguage = 'Korean';

    expect(resolveEffectiveLanguages(settings, '12345 ***')).toEqual({
      sourceLanguage: 'Japanese',
      targetLanguage: 'Korean'
    });
  });
});

describe('validateSettings', () => {
  it('flags missing base URL, API key, and model', () => {
    const result = validateSettings(createInitialState().settings, false);

    expect(result).toEqual([
      'Base URL is required.',
      'API Key is required.',
      'Model is required.'
    ]);
  });

  it('returns no errors for valid settings with API key present', () => {
    const { settings } = createInitialState();

    settings.baseUrl = 'https://api.example.com';
    settings.model = 'gpt-5-mini';

    const result = validateSettings(settings, true);

    expect(result).toEqual([]);
  });

  it('flags whitespace-only base URL and model as missing', () => {
    const { settings } = createInitialState();

    settings.baseUrl = '   ';
    settings.model = '\t';

    const result = validateSettings(settings, true);

    expect(result).toEqual(['Base URL is required.', 'Model is required.']);
  });
});
