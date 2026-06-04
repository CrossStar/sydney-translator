import { useState } from 'react';
import { MarkdownResult } from './MarkdownResult';
import { t, type Locale } from '../lib/i18n';
import type { VoiceProfile } from '../types/app';

interface TranslatorPanelProps {
  input: string;
  output: string;
  isLoading: boolean;
  error: string | null;
  notice: string | null;
  locale: Locale;
  onInputChange: (value: string) => void;
  onTranslate: () => void;
  onCopy: () => void;
  ttsEnabled: boolean;
  ttsSpeaking: boolean;
  ttsError: string | null;
  ttsVoiceProfiles: VoiceProfile[];
  ttsDefaultVoiceId: string;
  onSpeak: (text: string, profile: VoiceProfile) => void;
  onStopTts: () => void;
}

export function TranslatorPanel({
  input,
  output,
  isLoading,
  error,
  notice,
  locale,
  onInputChange,
  onTranslate,
  onCopy,
  ttsEnabled,
  ttsSpeaking,
  ttsError,
  ttsVoiceProfiles,
  ttsDefaultVoiceId,
  onSpeak,
  onStopTts,
}: TranslatorPanelProps) {
  const [view, setView] = useState<'raw' | 'rendered'>('raw');
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const canTranslate = input.trim().length > 0 && !isLoading;
  const canCopy = output.trim().length > 0;

  const effectiveVoiceId = selectedVoiceId || ttsDefaultVoiceId;
  const selectedProfile = ttsVoiceProfiles.find((p) => p.id === effectiveVoiceId) ?? ttsVoiceProfiles[0];
  const canSpeak = output.trim().length > 0 && ttsEnabled && !!selectedProfile && !ttsSpeaking;

  return (
    <div className="page">
      <div className="status-bar">
        {error && <span className="status-error">⚠ {error}</span>}
        {!error && ttsError && <span className="status-error">⚠ {ttsError}</span>}
        {!error && !ttsError && notice && <span className="status-notice">ℹ {notice}</span>}
      </div>
      <div className="translator-layout">
        <div className="pane">
          <div className="pane-header">
            <span className="pane-title">Source</span>
          </div>
          <div className="pane-body">
            <textarea
              aria-label="Source text"
              className="translator-textarea"
              placeholder={t(locale, 'input_placeholder')}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canTranslate) {
                  e.preventDefault();
                  onTranslate();
                }
              }}
            />
          </div>
          <div className="pane-footer">
            <span className="char-count">{input.length} chars</span>
            <button
              className="btn btn-primary"
              disabled={!canTranslate}
              onClick={() => onTranslate()}
              type="button"
            >
              {isLoading ? `${t(locale, 'btn_translate')}…` : `${t(locale, 'btn_translate')} →`}
            </button>
          </div>
        </div>

        <div className="pane">
          <div className="pane-header">
            <div className="pane-view-tabs">
              <button
                className={`pane-view-tab${view === 'raw' ? ' active' : ''}`}
                type="button"
                onClick={() => setView('raw')}
              >
                Raw
              </button>
              <button
                className={`pane-view-tab${view === 'rendered' ? ' active' : ''}`}
                type="button"
                onClick={() => setView('rendered')}
              >
                Rendered
              </button>
            </div>
            <button className="btn btn-ghost" disabled={!canCopy} onClick={onCopy} type="button">
              {t(locale, 'btn_copy')}
            </button>
            {ttsEnabled && ttsVoiceProfiles.length > 0 && (
              <div className="tts-controls">
                {ttsVoiceProfiles.length > 1 && (
                  <select
                    className="tts-voice-select"
                    value={effectiveVoiceId}
                    onChange={(e) => setSelectedVoiceId(e.target.value)}
                  >
                    {ttsVoiceProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name || p.presetVoiceId || p.id}</option>
                    ))}
                  </select>
                )}
                {ttsSpeaking ? (
                  <button
                    className="btn btn-ghost btn-tts btn-tts-stop"
                    type="button"
                    onClick={onStopTts}
                    title={t(locale, 'btn_stop')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-tts btn-tts-speak"
                    disabled={!canSpeak}
                    type="button"
                    onClick={() => {
                      if (selectedProfile) onSpeak(output, selectedProfile);
                    }}
                    title={t(locale, 'btn_speak')}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="output-body">
            {isLoading && !output ? (
              <div className="loading-lines">
                <div className="loading-line" style={{ width: '80%' }} />
                <div className="loading-line" style={{ width: '60%' }} />
                <div className="loading-line" style={{ width: '72%' }} />
                <div className="loading-line" style={{ width: '50%' }} />
              </div>
            ) : output ? (
              <>
                <MarkdownResult output={output} view={view} />
                {isLoading && <div className="output-loading-bar" />}
              </>
            ) : (
              <div className="output-placeholder">
                <span className="output-placeholder-icon">⇄</span>
                <span>{t(locale, 'output_placeholder')}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
