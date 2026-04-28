# Windows Smoke Checklist

1. Launch `npm run tauri:dev` on Windows.
2. If startup stays hidden in the tray, click the tray icon or use `Open Translator`; if settings are incomplete, confirm the main window appears automatically.
3. Save `Base URL`, `API Key`, and `Model`; confirm settings persist across restart.
4. Press the global hotkey and confirm the panel opens centered and focused.
5. Copy plain text and confirm the app shows a listener-only notification instead of auto-translating.
6. Select text and use hotkey mode; confirm the text appears in the input and can be translated.
7. Enable auto-popup selection mode and verify it works in Notepad and a browser text area.
8. Use the tray menu `Open Settings` and confirm the settings dialog opens directly.
9. Close the window from the title bar and confirm the app hides to tray instead of exiting.
10. Translate Markdown containing headings, links, and fenced code blocks; confirm structure is preserved.
11. Break the `Base URL` intentionally and confirm the UI shows an endpoint error.
12. Run `npm run tauri:build` on Windows and confirm NSIS/MSI packaging succeeds.
