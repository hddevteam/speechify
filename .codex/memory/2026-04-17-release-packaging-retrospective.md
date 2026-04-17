# 2026-04-17 Release Packaging Retrospective

## Sprint goal

Prepare the next Speechify marketplace release with:
- synchronized version metadata
- updated docs/site copy
- a shippable VSIX
- automated checks for release drift

## What changed

- Bumped the extension to `3.1.0`
- Synced `package.json`, `package-lock.json`, `CHANGELOG.md`, and GitHub Pages version markers
- Added `releaseMetadata.unit.test.ts` to lock:
  - package/package-lock version sync
  - changelog entry presence
  - GitHub Pages version sync
  - `.vscodeignore` exclusion of local runtime artifacts
- Raised the default local CosyVoice timeout from `300` to `900` seconds
- Updated README/settings guidance to match the new timeout default
- Fixed VSIX packaging by excluding `vendor/**`, `.codex/**`, and `.husky/**`

## What went wrong

- `vsce package` initially failed because the repo-local `vendor/CosyVoice` runtime was being included in the extension package.
- The website still advertised `3.0.7` while the extension package had already moved ahead, which is easy to miss without an explicit test.
- The previous `300` second default timeout was too optimistic for slower local zero-shot runs.

## What we learned

- Release consistency needs an explicit unit-test contract. Manual spot checks are not enough.
- Marketplace packaging boundaries are part of the product contract, not just release hygiene.
- Local runtime defaults should be set from observed machine behavior, not from optimistic assumptions.

## Follow-up rule

- Before any future marketplace publish:
  1. run `npm run test:unit`
  2. run `npx vsce package`
  3. inspect the VSIX file list for accidental local/runtime payloads
