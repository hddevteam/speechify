# Speechify Agent Memory

## Stable repo lessons

- Settings schema is now grouped by domain:
  - `speechify.provider`
  - `speechify.azure.*`
  - `speechify.cosyVoice.*`
  - `speechify.vision.*`
- Runtime reads must prefer grouped keys and only fall back to legacy flat keys for migration compatibility.
- `Open Speechify Settings (JSON)` is the migration surface. It should write grouped keys explicitly and remove legacy flat keys instead of leaving duplicate configuration behind.
- Do not rely on `vscode.workspace.getConfiguration().update(...)` alone when the user expects default-valued keys to appear in `.vscode/settings.json`. VS Code may omit default or empty values.
- For menu IA in this repo:
  - Azure-only actions belong in the Azure submenu.
  - Azure generation-adjacent actions such as `AI Smart Align` belong in the Azure action block, not in a generic top-level block.
  - Local cloning and recorder actions belong in the Local CosyVoice submenu.
  - User-facing audio wording should be `Generate Voiceover` / `生成配音`, not `Generate Audio` / `生成纯音频`.
  - Menu labels should stay provider-specific once a command lives inside a provider submenu. Example: `View Azure Configuration`, not generic `View Configuration`.

## Validation habits

- Add manifest-level unit tests when changing `package.json` menus or command labels.
- When moving a menu item between groups, assert its target `group` value in tests instead of only checking presence.
- Add settings-migration unit tests when changing config keys or namespace layout.
- Run:
  - `npm run compile-tests`
  - `npm run test:unit`
  - `npm run compile`

## Commit discipline

- Keep each sprint atomic: tests, implementation, docs alignment, then commit.
- Do not commit:
  - `.vscode/settings.json`
  - `vendor/`
  - `scripts/__pycache__/`
- Pre-commit currently tolerates existing lint warnings in unrelated files; do not broaden the touched surface unless the sprint needs it.
