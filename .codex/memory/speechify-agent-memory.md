# Speechify Agent Memory

## Stable repo lessons

- Settings schema is now grouped by domain:
  - `speechify.provider`
  - `speechify.azure.*`
  - `speechify.cosyVoice.*`
  - `speechify.vision.*`
- Runtime reads must prefer grouped keys and only fall back to legacy flat keys for migration compatibility.
- `Open Speechify Settings (JSON)` is the migration surface. It should write grouped keys explicitly and remove legacy flat keys instead of leaving duplicate configuration behind.
- `Open Speechify Settings (JSON)` should generate a guided JSONC template, not a bare key dump.
- The template should call out the current provider first, include inline examples/options, and reduce the need for the user to search external docs while editing.
- Do not rely on `vscode.workspace.getConfiguration().update(...)` alone when the user expects default-valued keys to appear in `.vscode/settings.json`. VS Code may omit default or empty values.
- For menu IA in this repo:
  - Azure-only actions belong in the Azure submenu.
  - Azure generation-adjacent actions such as `AI Smart Align` belong in the Azure action block, not in a generic top-level block.
  - Local cloning and recorder actions belong in the Local CosyVoice submenu.
  - If multiple local providers exist, each provider needs its own submenu and its own recorder/generation commands. Do not hide provider B behind provider A's labels.
  - Local capture actions such as `Record Reference Audio` belong in the Local CosyVoice action block near `Generate Voiceover`.
  - `Open Speechify Settings (JSON)` is a global entry and should stay at the top-level `Speechify` menu instead of being duplicated inside provider submenus.
  - When a local reference workflow supports audio, video, and in-editor recording, avoid narrowing the label to only `audio`; prefer `reference voice` / `参考声音` at the command level.
  - User-facing audio wording should be `Generate Voiceover` / `生成配音`, not `Generate Audio` / `生成纯音频`.
  - Menu labels should stay provider-specific once a command lives inside a provider submenu. Example: `View Azure Configuration`, not generic `View Configuration`.
  - Provider-specific generate actions must route incomplete configuration into that same provider's setup flow. Do not bounce a Qwen generation request into a CosyVoice or Azure-shaped wizard.
- For local provider expansion in this repo:
  - Treat provider addition as a six-surface change:
    - types/config
    - runtime dispatch
    - guided settings JSON
    - menu/command IA
    - docs/GitHub Pages
    - unit tests
  - Reuse the reference-media pipeline when possible, but keep provider-specific entrypoints and labels.
  - Qwen3-TTS in this repo runs through local Python + `mlx-audio`; it does not require a long-running backend service.
  - If the repo-standard Qwen runtime exists at `vendor/Qwen3-TTS/.venv312/bin/python`, leaving `speechify.qwenTts.pythonPath` empty should still work. Do not require manual path entry for the happy-path install layout.

## Validation habits

- Add manifest-level unit tests when changing `package.json` menus or command labels.
- When moving a menu item between groups, assert its target `group` value in tests instead of only checking presence.
- Add settings-migration unit tests when changing config keys or namespace layout.
- Add provider-routing unit tests when a generic entrypoint like `Configure Voice` or the incomplete-config fallback can resolve differently by provider.
- When command labels change, sync GitHub Pages and README examples in the same sprint. Do not leave docs on stale command names.
- Marketplace packaging must exclude repo-local runtime artifacts such as `vendor/**`; local CosyVoice assets are for developer/runtime setup, not for the extension VSIX.
- Marketplace packaging should also exclude dev-only repo metadata such as `.husky/**` and `.codex/**`.
- For local CosyVoice in this repo, `speechify.cosyVoice.requestTimeoutSeconds` should default to `900`, not `300`, because local zero-shot generation on slower machines can legitimately run for many minutes.
- This machine can publish `luckyXmobile.speechify` via `npx vsce publish` even when no `VSCE_PAT` environment variable is visible; try the direct publish path before assuming credentials are missing.
- Release work for this repo now has a dedicated skill: `.codex/skills/speechify-marketplace-release/SKILL.md`.
- Run:
  - `npm run compile-tests`
  - `npm run test:unit`
  - `npm run compile`

## Commit discipline

- Keep each sprint atomic: tests, implementation, docs alignment, then commit.
- For provider sprints, include a retrospective/memory update before the final commit.
- Do not commit:
  - `.vscode/settings.json`
  - `vendor/`
  - `scripts/__pycache__/`
- Pre-commit currently tolerates existing lint warnings in unrelated files; do not broaden the touched surface unless the sprint needs it.
