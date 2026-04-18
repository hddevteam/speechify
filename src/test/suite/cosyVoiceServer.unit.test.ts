import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('CosyVoice Server Contract', () => {
  test('repo-owned FastAPI server should buffer full audio responses instead of streaming chunks', () => {
    const serverPath = path.resolve(__dirname, '../../../scripts/cosyvoice_fastapi_server.py');
    const serverSource = fs.readFileSync(serverPath, 'utf8');

    assert.ok(
      serverSource.includes('from fastapi.responses import Response'),
      'server should use FastAPI Response for full audio bodies'
    );
    assert.ok(
      serverSource.includes('collect_audio_bytes'),
      'server should aggregate generated audio bytes before responding'
    );
    assert.ok(
      !serverSource.includes('StreamingResponse'),
      'server should not use StreamingResponse for CosyVoice audio output'
    );
    assert.ok(
      serverSource.includes('create_request_id'),
      'server should assign request ids so timeout reports can be correlated'
    );
    assert.ok(
      serverSource.includes('starting model inference'),
      'server should log inference phase boundaries for timeout diagnosis'
    );
    assert.ok(
      serverSource.includes('first audio chunk after'),
      'server should log first-audio timing for slow-request diagnosis'
    );
  });
});
