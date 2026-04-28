export type TriggerSource = 'manual' | 'hotkey' | 'selection';
export type SelectionMode = 'hotkey' | 'auto-popup';
export type UiLanguage = 'en' | 'zh';
export type CloseButtonAction = 'ask' | 'hide' | 'exit';

export interface Settings {
  baseUrl: string;
  apiKeyPresent: boolean;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  globalHotkey: string;
  selectionMode: SelectionMode;
  uiLanguage: UiLanguage;
  closeButtonAction: CloseButtonAction;
}

export interface TranslationState {
  input: string;
  output: string;
  lastTrigger: TriggerSource | null;
  notice: string | null;
  isLoading: boolean;
  error: string | null;
}
