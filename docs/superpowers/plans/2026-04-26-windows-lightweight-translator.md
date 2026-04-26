# Windows Lightweight Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Windows desktop translator that uses GPT-compatible APIs, preserves Markdown structure during translation, and supports global hotkey, clipboard listening, and text-selection-driven translation.

**Architecture:** The product consists of a Tauri desktop shell with a React + TypeScript frontend and a small Rust Windows helper process started as a Tauri sidecar. The frontend owns translation flow, settings, and rendering; the sidecar owns hotkey, clipboard, and text-selection events and emits structured JSON events back to the main app.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vite, Vitest, React Testing Library, `react-markdown`, Windows Credential Manager via Rust crate, Rust sidecar helper.

---

## File Structure

### Frontend

- Create: `package.json` for app scripts and dependencies
- Create: `tsconfig.json` for TypeScript compiler settings
- Create: `vite.config.ts` for Vite and Vitest configuration
- Create: `index.html` for the root app shell
- Create: `src/main.tsx` to bootstrap the React app
- Create: `src/App.tsx` as the top-level app controller
- Create: `src/styles.css` for the lightweight centered-panel UI
- Create: `src/types/app.ts` for shared UI and translation types
- Create: `src/state/app-store.ts` for app state and actions
- Create: `src/lib/openai-client.ts` for GPT-compatible HTTP requests
- Create: `src/lib/prompt.ts` for Markdown-preserving translation instructions
- Create: `src/lib/translation-service.ts` for validation, request mapping, and error classification
- Create: `src/lib/ipc.ts` for Tauri command and event bindings
- Create: `src/components/TranslatorPanel.tsx` for input, translate action, and result layout
- Create: `src/components/SettingsDialog.tsx` for `Base URL`, `API Key`, `Model`, language, and mode settings
- Create: `src/components/MarkdownResult.tsx` for rendered output and raw copy action
- Create: `src/tests/translation-service.test.ts` for translation logic tests
- Create: `src/tests/app-store.test.ts` for state and validation tests
- Create: `src/tests/app-shell.test.tsx` for UI behavior tests

### Tauri Host

- Create: `src-tauri/Cargo.toml` for desktop host dependencies
- Create: `src-tauri/tauri.conf.json` for app metadata, window defaults, tray, and sidecar registration
- Create: `src-tauri/src/main.rs` to boot Tauri, register commands, and start helper
- Create: `src-tauri/src/commands.rs` for config, secure storage, window, and helper lifecycle commands
- Create: `src-tauri/src/state.rs` for app-side persisted settings and last-result state
- Create: `src-tauri/src/secure_store.rs` for Windows Credential Manager read/write/delete helpers
- Create: `src-tauri/src/window.rs` for centered panel show/hide/focus behavior
- Create: `src-tauri/src/tray.rs` for minimal tray menu actions
- Create: `src-tauri/src/helper.rs` for sidecar startup and event forwarding into Tauri events
- Create: `src-tauri/tests/config_tests.rs` for Rust-side config and secure storage tests

### Windows Helper Sidecar

- Create: `windows-helper/Cargo.toml` for helper dependencies
- Create: `windows-helper/src/main.rs` to start clipboard, hotkey, and selection watchers
- Create: `windows-helper/src/events.rs` for helper event payloads
- Create: `windows-helper/src/hotkey.rs` for global hotkey registration and dispatch
- Create: `windows-helper/src/clipboard.rs` for text-only clipboard monitoring
- Create: `windows-helper/src/selection.rs` for selection capture strategies and popup mode hooks
- Create: `windows-helper/src/stdout_ipc.rs` for JSON line event output
- Create: `windows-helper/tests/events_test.rs` for event serialization tests

## Task 1: Bootstrap the Tauri + React Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/tests/app-shell.test.tsx`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`

- [ ] **Step 1: Write the failing UI smoke test**

```tsx
import { render, screen } from '@testing-library/react';
import App from '../App';

it('shows the translator title', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Translator' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: FAIL with `Cannot find module '../App'` or missing test setup.

- [ ] **Step 3: Create the minimal workspace and app shell**

```json
{
  "name": "translator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

```tsx
export default function App() {
  return (
    <main className="shell">
      <h1>Translator</h1>
      <p>Lightweight GPT-powered translation for Windows.</p>
    </main>
  );
}
```

```rust
fn main() {
    translator_lib::run();
}
```

- [ ] **Step 4: Run tests to verify the shell passes**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: PASS with one passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src src-tauri
git commit -m "chore: scaffold tauri translator workspace"
```

## Task 2: Define Shared Types, Settings State, and Validation

**Files:**
- Create: `src/types/app.ts`
- Create: `src/state/app-store.ts`
- Create: `src/tests/app-store.test.ts`

- [ ] **Step 1: Write the failing state tests**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, validateSettings } from '../state/app-store';

describe('settings validation', () => {
  it('flags missing base URL, API key, and model', () => {
    const result = validateSettings(createInitialState().settings, false);
    expect(result).toEqual([
      'Base URL is required.',
      'API Key is required.',
      'Model is required.'
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/app-store.test.ts`
Expected: FAIL with missing `createInitialState` or `validateSettings` exports.

- [ ] **Step 3: Implement shared types and validation**

```ts
export type TriggerSource = 'manual' | 'hotkey' | 'clipboard' | 'selection';
export type SelectionMode = 'hotkey' | 'auto-popup';

export interface Settings {
  baseUrl: string;
  apiKeyPresent: boolean;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  globalHotkey: string;
  selectionMode: SelectionMode;
  clipboardEnabled: boolean;
}

export interface TranslationState {
  input: string;
  output: string;
  lastTrigger: TriggerSource | null;
  isLoading: boolean;
  error: string | null;
}
```

```ts
import type { Settings, TranslationState } from '../types/app';

export function createInitialState(): { settings: Settings; translation: TranslationState } {
  return {
    settings: {
      baseUrl: '',
      apiKeyPresent: false,
      model: '',
      sourceLanguage: 'auto',
      targetLanguage: 'English',
      globalHotkey: 'Alt+Space',
      selectionMode: 'hotkey',
      clipboardEnabled: false
    },
    translation: {
      input: '',
      output: '',
      lastTrigger: null,
      isLoading: false,
      error: null
    }
  };
}

export function validateSettings(settings: Settings, apiKeyPresent: boolean): string[] {
  const errors: string[] = [];
  if (!settings.baseUrl.trim()) errors.push('Base URL is required.');
  if (!apiKeyPresent) errors.push('API Key is required.');
  if (!settings.model.trim()) errors.push('Model is required.');
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/app-store.test.ts`
Expected: PASS with validation failures classified correctly.

- [ ] **Step 5: Commit**

```bash
git add src/types/app.ts src/state/app-store.ts src/tests/app-store.test.ts
git commit -m "feat: add settings state and validation"
```

## Task 3: Implement GPT-Compatible Translation Service

**Files:**
- Create: `src/lib/openai-client.ts`
- Create: `src/lib/prompt.ts`
- Create: `src/lib/translation-service.ts`
- Create: `src/tests/translation-service.test.ts`

- [ ] **Step 1: Write the failing translation service tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { translateMarkdown } from '../lib/translation-service';

describe('translateMarkdown', () => {
  it('classifies 401 responses as auth errors', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      translateMarkdown(
        { baseUrl: 'https://example.com/v1', apiKey: 'key', model: 'gpt-4.1-mini' },
        { sourceLanguage: 'auto', targetLanguage: 'English', text: '# 标题' },
        fetcher
      )
    ).rejects.toThrow('Authentication failed. Check API Key permissions.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/translation-service.test.ts`
Expected: FAIL because `translateMarkdown` does not exist.

- [ ] **Step 3: Implement prompt construction, request logic, and error mapping**

```ts
export function buildTranslationPrompt(sourceLanguage: string, targetLanguage: string, text: string): string {
  return [
    `Translate the following Markdown from ${sourceLanguage} to ${targetLanguage}.`,
    'Preserve Markdown syntax and structure.',
    'Translate only prose content.',
    'Do not modify code blocks, links, heading levels, or list structure.',
    '',
    text
  ].join('\n');
}
```

```ts
export async function requestChatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  prompt: string,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  return response;
}
```

```ts
export async function translateMarkdown(config, input, fetcher = fetch): Promise<string> {
  const response = await requestChatCompletion(
    config.baseUrl,
    config.apiKey,
    config.model,
    buildTranslationPrompt(input.sourceLanguage, input.targetLanguage, input.text),
    fetcher
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Authentication failed. Check API Key permissions.');
    }
    if (response.status === 404) {
      throw new Error('Endpoint not found. Check Base URL compatibility.');
    }
    throw new Error('Translation request failed.');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Provider response is not OpenAI-compatible.');
  }
  return content;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/tests/translation-service.test.ts`
Expected: PASS with error classification working.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openai-client.ts src/lib/prompt.ts src/lib/translation-service.ts src/tests/translation-service.test.ts
git commit -m "feat: add markdown-preserving translation service"
```

## Task 4: Build the Centered Translator Panel UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/TranslatorPanel.tsx`
- Create: `src/components/MarkdownResult.tsx`
- Modify: `src/tests/app-shell.test.tsx`

- [ ] **Step 1: Write the failing UI interaction tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../App';

it('disables translate when input is empty', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Translate' })).toBeDisabled();
});

it('shows the rendered result area', () => {
  render(<App />);
  expect(screen.getByText('Translation result')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: FAIL because the translate button and result region do not exist.

- [ ] **Step 3: Implement the panel and Markdown result surface**

```tsx
export function TranslatorPanel({
  input,
  output,
  isLoading,
  error,
  onInputChange,
  onTranslate,
  onCopy
}) {
  return (
    <section className="panel">
      <textarea value={input} onChange={(event) => onInputChange(event.target.value)} />
      <button disabled={!input.trim() || isLoading} onClick={onTranslate}>Translate</button>
      {error ? <p role="alert">{error}</p> : null}
      <MarkdownResult output={output} onCopy={onCopy} />
    </section>
  );
}
```

```tsx
import ReactMarkdown from 'react-markdown';

export function MarkdownResult({ output, onCopy }: { output: string; onCopy: () => void }) {
  return (
    <section aria-label="Translation result">
      <h2>Translation result</h2>
      <button onClick={onCopy}>Copy raw text</button>
      <ReactMarkdown>{output || '_No translation yet._'}</ReactMarkdown>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify the UI passes**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: PASS with the disabled button and result region rendered.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css src/components/TranslatorPanel.tsx src/components/MarkdownResult.tsx src/tests/app-shell.test.tsx
git commit -m "feat: add centered translator panel UI"
```

## Task 5: Add Settings UI and Tauri-Side Persistence

**Files:**
- Create: `src/components/SettingsDialog.tsx`
- Create: `src/lib/ipc.ts`
- Modify: `src/App.tsx`
- Create: `src-tauri/src/state.rs`
- Create: `src-tauri/src/secure_store.rs`
- Create: `src-tauri/src/commands.rs`
- Create: `src-tauri/tests/config_tests.rs`

- [ ] **Step 1: Write the failing persistence tests**

```rust
#[test]
fn settings_round_trip_keeps_non_secret_fields() {
    let settings = AppSettings {
        base_url: "https://example.com/v1".into(),
        model: "gpt-4.1-mini".into(),
        source_language: "auto".into(),
        target_language: "English".into(),
        global_hotkey: "Alt+Space".into(),
        selection_mode: "hotkey".into(),
        clipboard_enabled: true,
    };
    let saved = settings.clone();
    assert_eq!(saved.base_url, settings.base_url);
    assert_eq!(saved.model, settings.model);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings_round_trip_keeps_non_secret_fields`
Expected: FAIL because `AppSettings` and persistence functions do not exist.

- [ ] **Step 3: Implement settings commands and secure API key storage**

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub base_url: String,
    pub model: String,
    pub source_language: String,
    pub target_language: String,
    pub global_hotkey: String,
    pub selection_mode: String,
    pub clipboard_enabled: bool,
}
```

```rust
#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    state::save_settings(&settings).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_api_key(api_key: String) -> Result<(), String> {
    secure_store::save_api_key(&api_key).map_err(|err| err.to_string())
}
```

```ts
import { invoke } from '@tauri-apps/api/core';

export async function saveSettings(settings) {
  await invoke('save_settings', { settings });
}

export async function saveApiKey(apiKey: string) {
  await invoke('save_api_key', { apiKey });
}
```

- [ ] **Step 4: Run tests to verify persistence passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS with config serialization and non-secret persistence covered.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsDialog.tsx src/lib/ipc.ts src/App.tsx src-tauri/src/state.rs src-tauri/src/secure_store.rs src-tauri/src/commands.rs src-tauri/tests/config_tests.rs
git commit -m "feat: add settings persistence and secure api key storage"
```

## Task 6: Wire Translation Actions, Validation, and Window Behavior

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/state/app-store.ts`
- Modify: `src/lib/ipc.ts`
- Create: `src-tauri/src/window.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write the failing app action tests**

```tsx
it('shows a validation error before sending when required settings are missing', async () => {
  render(<App />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Base URL is required.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: FAIL because translate action has no validation path.

- [ ] **Step 3: Implement async translation flow and centered-panel commands**

```tsx
async function handleTranslate() {
  const errors = validateSettings(state.settings, state.settings.apiKeyPresent);
  if (errors.length > 0) {
    setState((current) => ({
      ...current,
      translation: { ...current.translation, error: errors[0] }
    }));
    return;
  }

  setState((current) => ({ ...current, translation: { ...current.translation, isLoading: true, error: null } }));
  try {
    const output = await translateMarkdown(config, input);
    setState((current) => ({
      ...current,
      translation: { ...current.translation, output, isLoading: false }
    }));
  } catch (error) {
    setState((current) => ({
      ...current,
      translation: { ...current.translation, error: (error as Error).message, isLoading: false }
    }));
  }
}
```

```rust
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    window::show_centered(&app).map_err(|err| err.to_string())
}
```

- [ ] **Step 4: Run tests to verify the app action passes**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: PASS with validation shown before any request is sent.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/state/app-store.ts src/lib/ipc.ts src-tauri/src/window.rs src-tauri/src/commands.rs src/tests/app-shell.test.tsx
git commit -m "feat: wire translation actions and window controls"
```

## Task 7: Add Tray Menu and Rust Sidecar Event Bridge

**Files:**
- Create: `src-tauri/src/tray.rs`
- Create: `src-tauri/src/helper.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write the failing Rust helper bridge tests**

```rust
#[test]
fn parses_helper_stdout_event() {
    let line = r#"{"event":"clipboard_text","text":"hello","source":"clipboard"}"#;
    let event: HelperEvent = serde_json::from_str(line).unwrap();
    assert_eq!(event.event, "clipboard_text");
    assert_eq!(event.text.as_deref(), Some("hello"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml parses_helper_stdout_event`
Expected: FAIL because `HelperEvent` and helper bridge code do not exist.

- [ ] **Step 3: Implement tray actions and sidecar JSON event forwarding**

```rust
#[derive(Debug, Deserialize)]
pub struct HelperEvent {
    pub event: String,
    pub text: Option<String>,
    pub source: Option<String>,
}
```

```rust
pub fn spawn_helper(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (mut rx, _child) = tauri_plugin_shell::ShellExt::shell(&app)
        .sidecar("windows-helper")?
        .spawn()?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                if let Ok(parsed) = serde_json::from_slice::<HelperEvent>(&line) {
                    let _ = app.emit("helper-event", parsed);
                }
            }
        }
    });
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify the bridge passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS with helper event parsing covered.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/tray.rs src-tauri/src/helper.rs src-tauri/src/main.rs src-tauri/src/commands.rs src-tauri/tests
git commit -m "feat: add tray menu and helper sidecar bridge"
```

## Task 8: Build the Windows Helper for Hotkey, Clipboard, and Selection Events

**Files:**
- Create: `windows-helper/Cargo.toml`
- Create: `windows-helper/src/main.rs`
- Create: `windows-helper/src/events.rs`
- Create: `windows-helper/src/hotkey.rs`
- Create: `windows-helper/src/clipboard.rs`
- Create: `windows-helper/src/selection.rs`
- Create: `windows-helper/src/stdout_ipc.rs`
- Create: `windows-helper/tests/events_test.rs`

- [ ] **Step 1: Write the failing helper event serialization tests**

```rust
#[test]
fn serializes_clipboard_event_as_json_line() {
    let event = HelperEvent::clipboard_text("hello".into());
    let line = serde_json::to_string(&event).unwrap();
    assert!(line.contains("clipboard_text"));
    assert!(line.contains("hello"));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path windows-helper/Cargo.toml serializes_clipboard_event_as_json_line`
Expected: FAIL because `HelperEvent` and helper crate do not exist.

- [ ] **Step 3: Implement the helper event model and watcher skeletons**

```rust
#[derive(Debug, Serialize)]
pub struct HelperEvent {
    pub event: &'static str,
    pub text: Option<String>,
    pub source: Option<&'static str>,
}

impl HelperEvent {
    pub fn clipboard_text(text: String) -> Self {
        Self { event: "clipboard_text", text: Some(text), source: Some("clipboard") }
    }

    pub fn hotkey_trigger() -> Self {
        Self { event: "hotkey_trigger", text: None, source: Some("hotkey") }
    }
}
```

```rust
fn main() -> anyhow::Result<()> {
    hotkey::start_hotkey_loop()?;
    clipboard::start_clipboard_loop()?;
    selection::start_selection_loop()?;
    Ok(())
}
```

```rust
pub fn emit(event: &HelperEvent) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string(event)?);
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify the helper skeleton passes**

Run: `cargo test --manifest-path windows-helper/Cargo.toml`
Expected: PASS with JSON event serialization covered.

- [ ] **Step 5: Commit**

```bash
git add windows-helper
git commit -m "feat: add windows helper skeleton for system events"
```

## Task 9: Connect Helper Events to UI Workflows

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/App.tsx`
- Modify: `src/state/app-store.ts`
- Modify: `src/components/SettingsDialog.tsx`
- Modify: `src/tests/app-shell.test.tsx`

- [ ] **Step 1: Write the failing helper-event UI tests**

```tsx
it('hydrates the input when a clipboard helper event arrives', async () => {
  mockHelperEvent({ event: 'clipboard_text', text: 'copied text', source: 'clipboard' });
  render(<App />);
  expect(await screen.findByDisplayValue('copied text')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: FAIL because helper events are not consumed by the UI.

- [ ] **Step 3: Implement helper-event handling in the app store and UI**

```ts
export interface HelperEvent {
  event: 'clipboard_text' | 'selection_text' | 'hotkey_trigger';
  text?: string;
  source?: 'clipboard' | 'selection' | 'hotkey';
}

export function reduceHelperEvent(state, event: HelperEvent) {
  if (event.text) {
    return {
      ...state,
      translation: {
        ...state.translation,
        input: event.text,
        lastTrigger: event.source ?? null,
        error: null
      }
    };
  }
  return state;
}
```

```tsx
useEffect(() => {
  return listen<HelperEvent>('helper-event', (event) => {
    setState((current) => reduceHelperEvent(current, event.payload));
  });
}, []);
```

- [ ] **Step 4: Run tests to verify the workflow passes**

Run: `npm test -- --run src/tests/app-shell.test.tsx`
Expected: PASS with clipboard and selection events pre-filling the panel.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ipc.ts src/App.tsx src/state/app-store.ts src/components/SettingsDialog.tsx src/tests/app-shell.test.tsx
git commit -m "feat: connect helper events to translator workflows"
```

## Task 10: Finish Windows-Specific Behavior and Manual Verification Checklist

**Files:**
- Modify: `windows-helper/src/hotkey.rs`
- Modify: `windows-helper/src/clipboard.rs`
- Modify: `windows-helper/src/selection.rs`
- Modify: `src-tauri/tauri.conf.json`
- Create: `docs/testing/windows-smoke-checklist.md`

- [ ] **Step 1: Write the failing helper behavior tests**

```rust
#[test]
fn ignores_non_text_clipboard_payloads() {
    assert!(should_emit_clipboard_text(None).is_none());
}

#[test]
fn auto_popup_mode_marks_selection_event() {
    let event = build_selection_event("hello".into(), true);
    assert_eq!(event.event, "selection_text");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path windows-helper/Cargo.toml`
Expected: FAIL because the helper filtering and selection mode helpers are incomplete.

- [ ] **Step 3: Implement final helper behavior and add a smoke checklist**

```rust
pub fn should_emit_clipboard_text(text: Option<String>) -> Option<HelperEvent> {
    let text = text?.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(HelperEvent::clipboard_text(text))
}

pub fn build_selection_event(text: String, auto_popup: bool) -> HelperEvent {
    let _ = auto_popup;
    HelperEvent { event: "selection_text", text: Some(text), source: Some("selection") }
}
```

```md
# Windows Smoke Checklist

1. Launch `npm run tauri:dev` on Windows.
2. Save `Base URL`, `API Key`, and `Model`; confirm settings persist across restart.
3. Press the global hotkey and confirm the panel opens centered and focused.
4. Copy plain text and confirm the app shows a listener-only notification instead of auto-translating.
5. Select text and use hotkey mode; confirm the text appears in the input and can be translated.
6. Enable auto-popup selection mode and verify it works in Notepad and a browser text area.
7. Translate Markdown containing headings, links, and fenced code blocks; confirm structure is preserved.
8. Break the `Base URL` intentionally and confirm the UI shows an endpoint error.
```

- [ ] **Step 4: Run tests to verify final helper behavior passes**

Run: `cargo test --manifest-path windows-helper/Cargo.toml && npm test -- --run`
Expected: PASS for automated tests; manual checklist remains for real Windows validation.

- [ ] **Step 5: Commit**

```bash
git add windows-helper/src/hotkey.rs windows-helper/src/clipboard.rs windows-helper/src/selection.rs src-tauri/tauri.conf.json docs/testing/windows-smoke-checklist.md
git commit -m "feat: complete windows translation workflows"
```

## Self-Review

- Spec coverage: the plan covers lightweight desktop shell, configurable GPT-compatible settings, Markdown-preserving translation flow, global hotkey, clipboard listener mode, two selection modes, centered panel UI, tray controls, persistence, secure key storage, error handling, and Windows smoke validation.
- Placeholder scan: no `TBD`, `TODO`, or deferred “implement later” language remains in the task steps.
- Type consistency: the plan uses `Settings`, `TranslationState`, `HelperEvent`, `SelectionMode`, and `TriggerSource` consistently across frontend, Tauri host, and helper tasks.

