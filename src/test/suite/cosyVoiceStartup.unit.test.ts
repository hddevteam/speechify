import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('CosyVoice Startup Wiring', () => {
  test('package.json should expose a cosyvoice:start script', () => {
    const packageJsonPath = path.resolve(__dirname, '../../../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    assert.strictEqual(
      packageJson.scripts?.['cosyvoice:start'],
      'bash scripts/run-cosyvoice-server.sh',
      'cosyvoice:start should point to the repo-owned startup script'
    );
  });

  test('startup script should launch the repo-owned FastAPI server', () => {
    const scriptPath = path.resolve(__dirname, '../../../scripts/run-cosyvoice-server.sh');
    const script = fs.readFileSync(scriptPath, 'utf8');

    assert.ok(
      script.includes('scripts/cosyvoice_fastapi_server.py'),
      'startup script should launch scripts/cosyvoice_fastapi_server.py'
    );
    assert.ok(
      !script.includes('runtime/python/fastapi/server.py'),
      'startup script should not launch the upstream vendor server directly'
    );
  });
});
