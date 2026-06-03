export type TriggerSource = 'manual' | 'hotkey' | 'selection';
export type SelectionMode = 'hotkey' | 'auto-popup';
export type UiLanguage = 'en' | 'zh';
export type CloseButtonAction = 'ask' | 'hide' | 'exit';
export type TranslationProvider = 'ai' | 'bing' | 'google';
export type ThemePreset = 'light' | 'dark' | 'absolutely-light' | 'absolutely-dark';
export type UpdateDismiss = 'never' | string; // 'never' = ignore all, semver = ignore until next
export type VoiceProfileType = 'preset' | 'clone';

export interface VoiceProfile {
  id: string;
  name: string;
  type: VoiceProfileType;
  presetVoiceId?: string;
  referenceAudioPath?: string;
  language?: string;
  description?: string;
}

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
  autoDetectZhEnDirection: boolean;
  dismissedUpdate: string; // '' = none dismissed, semver = that version dismissed
  proxyUrl: string;
  ttsEnabled: boolean;
  ttsAutoPlay: boolean;
  ttsApiEndpoint: string;
  ttsApiKeyPresent: boolean;
  ttsDefaultVoiceId: string;
  ttsVoiceProfiles: VoiceProfile[];
}

export interface TranslationState {
  input: string;
  output: string;
  lastTrigger: TriggerSource | null;
  notice: string | null;
  isLoading: boolean;
  error: string | null;
}
