import type { HelperEvent } from '../lib/ipc';
import type { Settings, TranslationState } from '../types/app';

export function resolveEffectiveLanguages(settings: Settings, text: string): Pick<Settings, 'sourceLanguage' | 'targetLanguage'> {
  if (!settings.autoDetectZhEnDirection) {
    return {
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    };
  }

  const hasChinese = /[㐀-䶿一-鿿豈-﫿]/.test(text);
  const hasEnglish = /[A-Za-z]/.test(text);

  if (hasChinese && !hasEnglish) {
    return { sourceLanguage: 'Chinese', targetLanguage: 'English' };
  }

  if (hasEnglish && !hasChinese) {
    return { sourceLanguage: 'English', targetLanguage: 'Chinese' };
  }

  return {
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
  };
}

export function createInitialState(): {
  settings: Settings;
  translation: TranslationState;
} {
  return {
    settings: {
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
    },
    translation: {
      input: '',
      output: '',
      lastTrigger: null,
      notice: null,
      isLoading: false,
      error: null
    }
  };
}

export function validateSettings(
  settings: Settings,
  apiKeyPresent: boolean
): string[] {
  const errors: string[] = [];

  if (settings.translationProvider === 'ai') {
    if (!settings.baseUrl.trim()) {
      errors.push('Base URL is required.');
    }
    if (!apiKeyPresent) {
      errors.push('API Key is required.');
    }
    if (!settings.model.trim()) {
      errors.push('Model is required.');
    }
  }

  return errors;
}

export function reduceHelperEvent(
  translation: TranslationState,
  event: HelperEvent
): TranslationState {
  if (event.text?.trim()) {
    return {
      ...translation,
      input: event.text,
      lastTrigger: event.source ?? null,
      notice: null,
      error: null
    };
  }

  return translation;
}
