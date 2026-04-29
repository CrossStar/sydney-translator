export type TriggerSource = 'manual' | 'hotkey' | 'selection';
export type SelectionMode = 'hotkey' | 'auto-popup';
export type UiLanguage = 'en' | 'zh';
export type CloseButtonAction = 'ask' | 'hide' | 'exit';
export type TranslationProvider = 'ai' | 'bing' | 'google';
export type ThemePreset = 'light' | 'dark' | 'absolutely-light' | 'absolutely-dark';
export type UpdateDismiss = 'never' | string; // 'never' = ignore all, semver = ignore until next

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
  translationProvider: TranslationProvider;
  themePreset: ThemePreset;
  customCss: string;
  dismissedUpdate: string; // '' = none dismissed, semver = that version dismissed
  proxyUrl: string;
}

export interface TranslationState {
  input: string;
  output: string;
  lastTrigger: TriggerSource | null;
  notice: string | null;
  isLoading: boolean;
  error: string | null;
}
