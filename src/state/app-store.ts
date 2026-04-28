import type { HelperEvent } from '../lib/ipc';
import type { Settings, TranslationState } from '../types/app';

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

  if (!settings.baseUrl.trim()) {
    errors.push('Base URL is required.');
  }

  if (!apiKeyPresent) {
    errors.push('API Key is required.');
  }

  if (!settings.model.trim()) {
    errors.push('Model is required.');
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
