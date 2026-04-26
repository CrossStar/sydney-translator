# Windows Lightweight Translator Design

## Summary

This project is a lightweight Windows desktop translator built on GPT-compatible APIs. The product goal is fast translation with minimal surface area, not a general chat client. Users configure only `Base URL`, `API Key`, and `Model`, then invoke translation through system-level entry points.

The MVP must support:

- Windows desktop application
- Custom `Base URL`, `API Key`, and `Model`
- Markdown-aware translation that preserves Markdown structure and translates only natural language content
- Global hotkey summon
- Clipboard monitoring with notification-only behavior
- Text selection translation with two switchable modes
- Centered small panel window for translation results

## Goals

- Keep the application lightweight in package size, memory use, and UI complexity
- Make translation accessible from anywhere in Windows through system integrations
- Support GPT-compatible providers through configurable endpoint and model settings
- Render translated output as Markdown while preserving structure from Markdown input

## Non-Goals

- Multi-session chat
- Full ChatGPT-style conversation management
- Custom prompts or terminology glossaries in the MVP
- Cloud sync, account systems, or analytics dashboards
- Rich clipboard content such as images, files, or formatted document objects

## Recommended Architecture

The approved architecture is `Tauri + frontend UI + Windows helper module`.

### Main Application

The main application uses Tauri for the desktop shell and a web frontend for the UI. It is responsible for:

- Settings UI
- Translation panel UI
- Markdown rendering of translated output
- Building and issuing GPT-compatible API requests
- Persisting local settings
- Receiving text from system-level triggers

### Windows Helper Module

The Windows helper module is a small companion process focused on OS integration. It is responsible for:

- Registering and handling the global hotkey
- Monitoring clipboard text changes
- Detecting or retrieving selected text for translation workflows
- Waking or messaging the main application with captured text

This separation keeps the main app lightweight and easier to maintain. The helper does not call model APIs and does not own business logic.

### Data Ownership

- Main app owns translation logic, configuration, and UI state
- Helper owns Windows event listening and text capture only

## Core User Flows

### Global Hotkey

The user presses a configurable global hotkey such as `Alt + Space`.

Expected behavior:

- Open the centered small panel window
- Focus the input field immediately
- Allow direct paste-and-translate
- Show the latest translation result if one exists
- Toggle visibility when appropriate to reduce friction

### Clipboard Monitoring

Clipboard monitoring is enabled as a listener-only mode in the MVP.

Expected behavior:

- Detect new clipboard text
- Do not automatically translate
- Show a lightweight prompt or tray notification that translatable text is available
- Open the main panel with the captured text when the user confirms or reopens via hotkey

This avoids aggressive interruption while preserving quick access.

### Text Selection Translation

The product supports two switchable modes.

#### Mode 1: Selection Plus Hotkey

The user selects text anywhere in Windows and presses the global hotkey to translate it.

This is the default mode because it is more stable and predictable.

#### Mode 2: Auto Popup on Selection

After text selection is detected, the helper attempts to capture the selected text and open the centered panel automatically.

This is an enhanced mode with known compatibility limits across Windows applications. It is supported, but not the default.

### Manual Translation

The user can always open the panel manually and paste or type text directly. This ensures the application remains useful even when system-level capture is unavailable in a specific target application.

## Translation Behavior

### Language Settings

The user can configure source language and target language freely.

The MVP does not hardcode fixed language pairs.

### Prompt Strategy

The translation request uses an internal instruction that emphasizes:

- Preserve Markdown syntax and structure
- Translate only human-readable prose content
- Do not alter code blocks
- Do not break links
- Preserve headings, lists, tables, and formatting hierarchy

This behavior is driven primarily by prompt control in the MVP rather than a local Markdown AST rewrite pipeline.

### Output Rendering

The translated result is rendered as Markdown in the result area.

The UI should also provide a simple way to copy the raw translated text, since some users will want the plain output rather than the rendered view.

## UI Design Scope

### Main Window

The main translation surface is a centered small panel window rather than a large full-screen interface or cursor-following tooltip.

The panel should prioritize:

- Fast appearance
- Minimal controls
- Clear source and result areas
- Visible loading and error states
- Easy copying of output

### Settings Window or Section

The settings surface only includes the MVP configuration items:

- `Base URL`
- `API Key`
- `Model`
- Source language
- Target language
- Global hotkey
- Text selection mode
- Clipboard monitoring enabled or disabled

The MVP intentionally excludes advanced controls such as custom prompt editing, temperature tuning, streaming mode controls, glossary management, and provider-specific extras.

### Tray Integration

The app may stay resident in the system tray. The tray menu should remain minimal:

- Open translation panel
- Enable or disable clipboard monitoring
- Switch text selection mode
- Open settings
- Exit

## Persistence and Security

### Stored Settings

Persist these settings locally:

- `Base URL`
- `Model`
- Source language
- Target language
- Global hotkey
- Text selection mode
- Clipboard monitoring state

### Sensitive Storage

`API Key` should not be stored as plain text in a generic config file if avoidable. Prefer Windows Credential Manager or an equivalent secure storage mechanism.

### Lightweight History

The MVP stores only lightweight working context:

- Most recent input
- Most recent output
- Most recent trigger source, such as manual, selection, clipboard, or hotkey

This is intentionally not a conversation history system.

## Error Handling

### Configuration Errors

If `Base URL`, `API Key`, or `Model` is missing, translation cannot start. The UI should show explicit guidance about what is missing.

### Request Failures

Errors should be classified clearly in the UI:

- `401` or `403`: authentication or authorization issue
- `404`: likely `Base URL` or endpoint path issue
- Timeout or network error: connectivity issue
- Response schema mismatch: provider is not sufficiently OpenAI-compatible

The application should avoid silent failures.

### Input Edge Cases

- Empty text should not trigger translation
- Very large text should warn the user or require confirmation before sending
- Clipboard monitoring should ignore non-text payloads

## Performance and Lightweight Constraints

- Keep the main window hidden until needed
- Use async request handling so the panel remains responsive
- Keep the helper process small and narrowly scoped
- Avoid building a generalized AI client feature set
- Prefer simple local state over heavy persistence or indexing systems

## Testing Strategy

Testing should focus on three layers.

### Configuration and Persistence

Verify:

- Saving and loading settings
- Validation of required fields
- Secure handling path for `API Key`

### Translation Flow

Verify:

- Plain text translation
- Markdown translation with structure preservation expectations
- Long-text warning behavior
- Error classification and display

### System Integration on Windows

Verify on real Windows environments:

- Global hotkey summon
- Clipboard text detection and notification path
- Selection-plus-hotkey flow
- Auto-popup selection mode behavior across representative applications

Unit tests can cover local logic, but Windows system integration requires real integration testing.

## Risks and Tradeoffs

- `Auto popup on selection` is inherently less stable across Windows applications than `selection plus hotkey`
- Prompt-based Markdown preservation is simpler and lighter than AST rewriting, but may not be perfect for every provider or malformed input
- Using a separate helper process improves architecture clarity and lightweight behavior in the main app, but adds packaging and IPC complexity

## Delivery Recommendation

Build the MVP in two internal milestones while keeping one product scope:

1. Main panel, settings, GPT-compatible translation flow, Markdown rendering, and global hotkey summon
2. Clipboard monitoring and both text selection translation modes through the Windows helper module

This keeps early validation possible without changing the approved product surface.
