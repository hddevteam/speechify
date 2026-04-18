# 2026-04-17 Qwen3-TTS Local Provider Retrospective

## Sprint goal

Add `Qwen3-TTS + MLX-Audio` as a second fully local Speechify provider without breaking the existing Azure and CosyVoice flows.

## What changed

- Added `qwen3-tts` to the provider type system, config manager, settings template, and provider dispatch.
- Implemented `QwenTtsService` to invoke local Python + `mlx-audio` directly and save `.wav` output back into the existing Speechify workflow.
- Reused the existing reference-media pipeline:
  - audio/video selection
  - in-VS-Code recording
  - local transcription via the current Whisper MLX-first path
- Added provider-specific guided settings for:
  - `speechify.qwenTts.pythonPath`
  - `speechify.qwenTts.model`
  - `speechify.qwenTts.promptAudioPath`
  - `speechify.qwenTts.promptText`
  - `speechify.qwenTts.requestTimeoutSeconds`
- Split the menu IA cleanly so Azure, CosyVoice, and Qwen each have explicit command surfaces.
- Added Qwen-specific record-reference and generate commands instead of forcing users through CosyVoice-labeled commands.
- Synced README and GitHub Pages so the product docs describe both local providers consistently.

## What almost went wrong

- A second local provider can look “done” at the synthesis layer while still being incomplete in menu wiring, command registration, and guided configuration.
- Reusing generic “configure voice” or “record reference audio” entrypoints can silently route users into the wrong provider flow.
- Provider-specific generation commands need provider-specific incomplete-config fallback. Otherwise the user chooses Qwen and gets bounced into an Azure- or CosyVoice-shaped setup path.

## What we learned

- In this repo, adding a new provider is not one feature. It is a cross-cutting contract across:
  - types/config
  - synthesis dispatch
  - guided settings
  - command/menu IA
  - docs/site copy
  - unit tests
- Local-provider parity matters as much as backend correctness. If Qwen can record reference audio, that capability needs a first-class Qwen command and menu slot.
- The cheapest regression tests for provider expansion are:
  - manifest/menu tests
  - settings-template tests
  - provider-routing unit tests
  - synthesis contract tests

## Follow-up rule

- For every future provider sprint in this repo:
  1. add or update provider contract tests first
  2. wire config, routing, menu commands, and guided settings in the same sprint
  3. update README and GitHub Pages before closing the sprint
  4. commit only after `npm run compile-tests`, `npm run test:unit`, and `npm run compile` are green
