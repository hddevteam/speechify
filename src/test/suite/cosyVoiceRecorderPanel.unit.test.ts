import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Module = require('module');

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

async function withVscodeMock<T>(callback: () => Promise<T> | T, language = 'zh-cn'): Promise<T> {
  const vscodeMock = {
    env: {
      language
    }
  };

  ModuleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === 'vscode') {
      return vscodeMock;
    }

    return originalModuleLoad.call(this, request, parent, isMain);
  };

  try {
    return await callback();
  } finally {
    ModuleInternals._load = originalModuleLoad;
  }
}

suite('CosyVoice Recorder Panel Layout', () => {
  test('should localize recorder permission errors in English', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../webview/cosyVoiceRecorderPanel')];
      const { CosyVoiceRecorderPanel } = require('../../webview/cosyVoiceRecorderPanel') as typeof import('../../webview/cosyVoiceRecorderPanel');

      const panelClass = CosyVoiceRecorderPanel as unknown as {
        normalizeRecorderError: (error: unknown, hostAppName: string) => string;
      };

      const permissionMessage = panelClass.normalizeRecorderError(new Error('Permission denied'), 'Code');
      const deviceMessage = panelClass.normalizeRecorderError(new Error('Input/output error'), 'Code');

      assert.ok(permissionMessage.includes('Microphone access was denied for Code'));
      assert.ok(!permissionMessage.includes('麦克风'));
      assert.strictEqual(
        deviceMessage,
        'No usable microphone input device was found. Check that your system default input device is available and try again.'
      );
    }, 'en');
  });

  test('should use simpler default reference text without product names', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../webview/cosyVoiceRecorderPanel')];
      const { CosyVoiceRecorderPanel } = require('../../webview/cosyVoiceRecorderPanel') as typeof import('../../webview/cosyVoiceRecorderPanel');

      const panelClass = CosyVoiceRecorderPanel as unknown as {
        getDefaultReferenceText: () => string;
      };

      const zhText = panelClass.getDefaultReferenceText();
      assert.strictEqual(zhText, '你好，这是一段参考录音。请用自然、清晰、稳定的语速朗读。');
      assert.ok(!zhText.includes('Speechify'));
      assert.ok(!zhText.includes('VS Code'));
    }, 'zh-cn');

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../webview/cosyVoiceRecorderPanel')];
      const { CosyVoiceRecorderPanel } = require('../../webview/cosyVoiceRecorderPanel') as typeof import('../../webview/cosyVoiceRecorderPanel');

      const panelClass = CosyVoiceRecorderPanel as unknown as {
        getDefaultReferenceText: () => string;
      };

      const enText = panelClass.getDefaultReferenceText();
      assert.strictEqual(enText, 'Hello. This is a reference recording. Please read it clearly and at a steady pace.');
      assert.ok(!enText.includes('Speechify'));
      assert.ok(!enText.includes('VS Code'));
    }, 'en');
  });

  test('should render the idle status and remove the custom close button', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../webview/cosyVoiceRecorderPanel')];
      const { CosyVoiceRecorderPanel } = require('../../webview/cosyVoiceRecorderPanel') as typeof import('../../webview/cosyVoiceRecorderPanel');

      const panelClass = CosyVoiceRecorderPanel as unknown as {
        getLabels: () => { title: string; idle: string };
        getHtml: (
          webview: { cspSource: string },
          initState: {
            labels: Record<string, string>;
            suggestedFileNamePrefix: string;
            hostAppName: string;
            defaultReferenceText: string;
          },
          styleUri: string,
          scriptUri: string
        ) => string;
        getDefaultReferenceText: () => string;
      };

      const labels = panelClass.getLabels();
      const html = panelClass.getHtml(
        { cspSource: 'vscode-webview://test' },
        {
          labels: panelClass.getLabels() as Record<string, string>,
          suggestedFileNamePrefix: 'cosyvoice-reference',
          hostAppName: 'VS Code',
          defaultReferenceText: panelClass.getDefaultReferenceText()
        },
        'style.css',
        'script.js'
      );

      assert.ok(html.includes(`id="statusBadge" class="status-badge idle">${labels.idle}</div>`));
      assert.ok(!html.includes('id="closeBtn"'));
    });
  });

  test('should keep the recorder stylesheet locked to the viewport without page scrollbars', () => {
    const cssPath = path.resolve(__dirname, '../../../media/cosyvoice-recorder.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('body {\n  margin: 0;\n  min-height: 100vh;\n  height: 100vh;\n  overflow: hidden;'));
    assert.ok(css.includes('.shell {\n  max-width: 880px;\n  margin: 0 auto;\n  min-height: 100vh;\n  height: 100vh;'));
    assert.ok(css.includes('.panel {\n  min-height: 0;\n  height: 100%;'));
  });
});
