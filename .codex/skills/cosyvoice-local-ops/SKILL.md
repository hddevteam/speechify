---
name: cosyvoice-local-ops
description: Diagnose and stabilize Speechify local CosyVoice startup, routing, and synthesis failures. Use when local voice cloning or local audio generation fails, when the wrong CosyVoice server is running, or when startup/documentation drift causes the runtime path to differ from the repo-owned server.
---

# CosyVoice Local Ops

Use this when Speechify local CosyVoice generation fails or behaves inconsistently.

## Core checks

1. Confirm the configured backend is local:
   - `speechify.provider = cosyvoice`
   - `speechify.cosyVoice.baseUrl` points to localhost, normally `http://127.0.0.1:50000`
2. Confirm the startup entry is the repo-owned script:
   - `package.json` must expose `cosyvoice:start`
   - `cosyvoice:start` must run `bash scripts/run-cosyvoice-server.sh`
3. Confirm the actual running process matches the repo-owned server:
   - Expected process path: `scripts/cosyvoice_fastapi_server.py`
   - Unexpected process path: `vendor/CosyVoice/runtime/python/fastapi/server.py`
4. Confirm the FastAPI server responds on `/docs` before debugging the extension side.

## Failure patterns

- Menu shows stale behavior after code changes:
  - Reload VS Code window before retesting.
- Docs say `npm run cosyvoice:start` but script is missing:
  - Fix `package.json` first. This is a startup contract bug.
- Local generation returns `stream aborted`:
  - First verify which server process is actually running.
  - Prefer the repo-owned server, not the upstream vendor runtime server.
- Repo-owned server is running but synthesis still aborts:
  - Check whether the server returns `StreamingResponse`.
  - For Speechify, prefer buffering the generated PCM and returning a full `Response`.
- Backend returns `500 Internal Server Error` with a prompt-audio assertion:
  - CosyVoice zero-shot prompt audio must be 30 seconds or shorter.
  - Speechify should normalize reference media to mono 16 kHz WAV and trim it before synthesis.
  - If this still happens, refresh the normalized cache by re-saving or re-selecting the reference media.
- Backend times out around 120 seconds on short text:
  - Do not assume the text chunk is too long.
  - Check server logs for `first audio chunk after ...ms`; local zero-shot can take more than two minutes before first audio.
  - Raise `speechify.cosyVoice.requestTimeoutSeconds` for local CosyVoice before changing chunking logic.
  - Treat `900` seconds as the repo default for slower local machines; do not revert that default casually.

- Settings JSON shows stale flat keys:
  - The current repo contract uses grouped keys such as `speechify.azure.*`, `speechify.cosyVoice.*`, and `speechify.vision.*`.
  - `Open Speechify Settings (JSON)` should migrate legacy flat keys into grouped keys instead of leaving both forms behind.
  - The settings entry should open a guided JSONC template with inline notes and examples, not just a raw list of keys.
  - For local troubleshooting, the CosyVoice section should explicitly mention that reference media can come from recording, audio, or video.

- Azure and local menu actions feel mixed together:
  - Azure-only actions should stay in the Azure submenu.
  - Keep `AI Smart Align`, `Set Azure OpenAI (Vision)`, and `View Azure Configuration` under Azure.
  - Within the Azure submenu, keep `AI Smart Align` in the action/generation block near `Generate Voiceover`, not mixed into settings.
  - Within the Local CosyVoice submenu, keep `Record Reference Audio` in the action/generation block near `Generate Voiceover`.
  - If another local provider exists, give it its own submenu and its own provider-labeled commands. Do not reuse a CosyVoice-labeled recorder or setup command for a different engine.
  - Keep `Open Speechify Settings (JSON)` as the single top-level global settings entry. Do not duplicate it inside provider submenus.
  - Use command labels that match the actual local workflow scope. If the user can record in VS Code or pick audio/video media, prefer `Set Reference Voice` over a narrower `Set Reference Audio`.
  - Audio commands should use the current naming contract: `Generate Voiceover`, not `Generate Audio`.
  - When these labels change, update GitHub Pages and README examples in the same sprint.
  - If a provider-specific generation command is missing config, route the user into that same provider's setup flow instead of a generic or wrong-provider wizard.

## Expected repo contract

- `scripts/run-cosyvoice-server.sh` launches `scripts/cosyvoice_fastapi_server.py`
- `scripts/cosyvoice_fastapi_server.py` returns complete binary audio responses, not streamed chunks
- `SpeechProviderService` retries once with a freshly normalized prompt clip when the backend reports the 30-second prompt limit
- `SpeechProviderService` uses a local CosyVoice-specific request timeout, defaulting to 900 seconds
- The configuration schema uses grouped keys:
  - `speechify.provider`
  - `speechify.cosyVoice.baseUrl`
  - `speechify.cosyVoice.pythonPath`
  - `speechify.cosyVoice.promptAudioPath`
  - `speechify.cosyVoice.promptText`
  - `speechify.cosyVoice.requestTimeoutSeconds`
- If the repo carries a second local provider, mirror the same contract discipline there:
  - provider enum/type
  - grouped settings
  - provider-specific command ids
  - menu placement tests
  - provider-routing tests
- Unit tests should lock both rules:
  - startup wiring
  - server response contract
  - prompt-audio refresh and user-facing error contract
  - timeout configuration and timeout-context contract
  - grouped settings migration contract

## Validation

Run:

```bash
npm run compile
npm run test:unit
```

Then verify manually:

1. Start the backend from the repo entrypoint.
2. Open `http://127.0.0.1:50000/docs`.
3. Retry `Local CosyVoice: Generate Voiceover` in VS Code.

## Do not do

- Do not assume the running CosyVoice server came from the current repo.
- Do not debug extension HTTP code before verifying the real backend process path.
- Do not leave startup instructions in README or GitHub Pages that are not backed by `package.json`.
