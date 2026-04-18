import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module = require('module');

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

async function withVscodeMock<T>(
  workspaceRoot: string,
  values: Map<string, unknown>,
  callback: () => Promise<T> | T
): Promise<T> {
  const configuredKeys = new Set(values.keys());
  const vscodeMock = {
    workspace: {
      workspaceFolders: [{ uri: { fsPath: workspaceRoot } }],
      getConfiguration: () => ({
        get: <Value>(section: string, defaultValue?: Value): Value =>
          (values.has(section) ? values.get(section) : defaultValue) as Value,
        inspect: (section: string): { workspaceValue?: unknown } | undefined =>
          configuredKeys.has(section) ? { workspaceValue: values.get(section) } : undefined,
        update: async () => undefined
      })
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

suite('ConfigManager Qwen3-TTS Defaults', () => {
  test('should use the standard Qwen3-TTS python path as the default when the setting is missing', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-default-'));
    const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-cwd-'));
    const originalCwd = process.cwd();

    try {
      process.chdir(isolatedCwd);
      await withVscodeMock(workspaceRoot, new Map<string, unknown>(), async () => {
        delete require.cache[require.resolve('../../utils/config')];
        const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

        const qwenConfig = ConfigManager.getQwenTtsConfig();
        const workspaceConfig = ConfigManager.getWorkspaceConfig();

        assert.strictEqual(
          workspaceConfig.qwenTtsPythonPath,
          '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
        );
        assert.ok(
          qwenConfig.pythonPath.endsWith('vendor/Qwen3-TTS/.venv312/bin/python'),
          'runtime resolution should still target the standard Qwen runtime layout'
        );
      });
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(isolatedCwd, { recursive: true, force: true });
    }
  });

  test('should fall back to a detected runtime when the default workspace python path does not exist', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-missing-default-'));
    const detectedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-detected-'));
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-home-isolated-'));
    const detectedPythonPath = path.join(detectedRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    const originalCwd = process.cwd();
    const originalHome = process.env.HOME;
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');

    try {
      process.env.HOME = fakeHome;
      process.chdir(detectedRoot);
      await withVscodeMock(workspaceRoot, new Map<string, unknown>(), async () => {
        delete require.cache[require.resolve('../../utils/config')];
        const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

        const qwenConfig = ConfigManager.getQwenTtsConfig();
        assert.strictEqual(fs.realpathSync(qwenConfig.pythonPath), fs.realpathSync(detectedPythonPath));
      });
    } finally {
      process.env.HOME = originalHome;
      process.chdir(originalCwd);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(detectedRoot, { recursive: true, force: true });
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  test('should detect a repo-owned runtime from a common home projects directory when running in another workspace', async () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-home-'));
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-other-workspace-'));
    const isolatedCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-other-cwd-'));
    const detectedPythonPath = path.join(fakeHome, 'projects', 'speechify', 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    const originalHome = process.env.HOME;
    const originalCwd = process.cwd();
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');

    try {
      process.env.HOME = fakeHome;
      process.chdir(isolatedCwd);
      await withVscodeMock(workspaceRoot, new Map<string, unknown>(), async () => {
        delete require.cache[require.resolve('../../utils/config')];
        const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

        const qwenConfig = ConfigManager.getQwenTtsConfig();
        assert.strictEqual(fs.realpathSync(qwenConfig.pythonPath), fs.realpathSync(detectedPythonPath));
      });
    } finally {
      process.env.HOME = originalHome;
      process.chdir(originalCwd);
      fs.rmSync(fakeHome, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(isolatedCwd, { recursive: true, force: true });
    }
  });

  test('should auto-detect the standard Qwen3-TTS python runtime when the setting is empty', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-config-qwen-'));
    const detectedPythonPath = path.join(workspaceRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');

    const values = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['qwenTts.pythonPath', ''],
      ['qwenTts.model', 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16'],
      ['qwenTts.promptAudioPath', '${workspaceFolder}/reference.wav']
    ]);

    try {
      await withVscodeMock(workspaceRoot, values, async () => {
        delete require.cache[require.resolve('../../utils/config')];
        const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

        const qwenConfig = ConfigManager.getQwenTtsConfig();
        assert.strictEqual(qwenConfig.pythonPath, detectedPythonPath);
        assert.strictEqual(ConfigManager.isConfigurationComplete('qwen3-tts'), true);
      });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
