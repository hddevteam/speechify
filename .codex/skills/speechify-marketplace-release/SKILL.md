---
name: speechify-marketplace-release
description: Prepare and publish a new Speechify VS Code Marketplace release. Use when bumping Speechify versions, syncing changelog/docs/package metadata, validating VSIX contents, packaging with vsce, or publishing luckyXmobile.speechify from this repo.
---

# Speechify Marketplace Release

Use this for repo-specific Speechify release work.

## Release contract

Before publishing, keep these aligned:
- `package.json` version
- `package-lock.json` root version
- `CHANGELOG.md`
- `docs/index.html`
- `docs/zh-cn.html`

The release test suite already checks this in `src/test/suite/releaseMetadata.unit.test.ts`.

## Packaging contract

Marketplace packages must exclude local/runtime and repo-only artifacts.

At minimum, `.vscodeignore` must exclude:
- `vendor/**`
- `.codex/**`
- `.husky/**`

Do not ship the local CosyVoice runtime inside the VSIX.

## CosyVoice release defaults

For local CosyVoice in this repo:
- `speechify.cosyVoice.requestTimeoutSeconds` defaults to `900`
- do not drop it back to `300` without fresh machine evidence

Sync the runtime default, config schema, README, and settings template together.

## Release flow

1. Update versioned files and release notes.
2. Run:
   ```bash
   npm run test:unit
   npm run compile
   npx vsce package
   ```
3. Inspect the VSIX file list. Confirm no repo-local runtime payloads are included.
4. Publish:
   ```bash
   npx vsce publish
   ```

## Credential rule

Do not assume a PAT environment variable is required on this machine.

If `VSCE_PAT` is absent, still try `npx vsce publish` once. This machine may already have a usable stored Marketplace login for publisher `luckyXmobile`.

## Post-publish

- Record the published version and outcome in `.codex/memory/`
- If a new packaging or version-drift issue surfaced, update:
  - this skill
  - `.codex/memory/speechify-agent-memory.md`
  - the sprint retrospective
