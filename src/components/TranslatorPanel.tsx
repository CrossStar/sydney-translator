import { MarkdownResult } from './MarkdownResult';
import { t, type Locale } from '../lib/i18n';

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
  onCopy
}: TranslatorPanelProps) {
  const canTranslate = input.trim().length > 0 && !isLoading;
  const canCopy = output.trim().length > 0;

  return (
    <div className="page">
      {(error || notice) && (
        <div className="status-bar">
          {error && <span className="status-error">⚠ {error}</span>}
          {!error && notice && <span className="status-notice">ℹ {notice}</span>}
        </div>
      )}
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
            <span className="pane-title">Translation</span>
            <button className="btn btn-ghost" disabled={!canCopy} onClick={onCopy} type="button">
              {t(locale, 'btn_copy')}
            </button>
          </div>
          {isLoading && !output ? (
            <div className="loading-lines">
              <div className="loading-line" style={{ width: '80%' }} />
              <div className="loading-line" style={{ width: '60%' }} />
              <div className="loading-line" style={{ width: '72%' }} />
              <div className="loading-line" style={{ width: '50%' }} />
            </div>
          ) : output ? (
            <div className="output-body">
              <MarkdownResult onCopy={onCopy} output={output} />
            </div>
          ) : (
            <div className="output-body">
              <div className="output-placeholder">
                <span className="output-placeholder-icon">⇄</span>
                <span>{t(locale, 'output_placeholder')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
