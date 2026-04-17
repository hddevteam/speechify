# Retrospective: Menu and Settings IA

## What worked

- Provider-based settings grouping (`azure`, `cosyVoice`, `vision`) reduced ambiguity immediately.
- Manifest-level unit tests caught menu placement and command-label regressions cheaply.
- Treating `Open Speechify Settings (JSON)` as the migration entrypoint kept runtime compatibility simple.

## What almost went wrong

- Flat legacy keys were still referenced in a few direct `vscode` reads outside `ConfigManager`.
- Relying on VS Code config updates alone would not have shown default or empty keys in `settings.json`, which is exactly what the user was checking.
- Azure-related actions were split between the top-level Speechify menu and Azure submenu, which made the information architecture inconsistent.

## Rule to carry forward

- When a repo feature is split by backend/provider, enforce the split in all three places together:
  - setting namespaces
  - menu grouping
  - command wording
