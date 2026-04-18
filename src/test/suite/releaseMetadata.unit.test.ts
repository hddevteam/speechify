import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Release Metadata', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };
  const packageLockJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8')) as {
    version: string;
    packages?: Record<string, { version?: string }>;
  };
  const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');
  const docsIndex = fs.readFileSync(path.join(repoRoot, 'docs/index.html'), 'utf8');
  const docsZhCn = fs.readFileSync(path.join(repoRoot, 'docs/zh-cn.html'), 'utf8');
  const vscodeIgnore = fs.readFileSync(path.join(repoRoot, '.vscodeignore'), 'utf8');

  test('should keep package-lock root version in sync with package.json', () => {
    assert.strictEqual(packageLockJson.version, packageJson.version);
    assert.strictEqual(packageLockJson.packages?.['']?.version, packageJson.version);
  });

  test('should include a changelog entry for the current package version', () => {
    assert.match(changelog, new RegExp(`^## \\[${packageJson.version.replace(/\./g, '\\.')}\\] - `, 'm'));
  });

  test('should keep GitHub Pages version markers in sync with package.json', () => {
    for (const doc of [docsIndex, docsZhCn]) {
      assert.ok(doc.includes(`Speechify ${packageJson.version}`));
      assert.ok(doc.includes(`"version": "${packageJson.version}"`));
    }
  });

  test('should exclude local CosyVoice runtime artifacts from marketplace packages', () => {
    assert.match(vscodeIgnore, /^vendor\/\*\*$/m);
    assert.match(vscodeIgnore, /^\.husky\/\*\*$/m);
  });
});
