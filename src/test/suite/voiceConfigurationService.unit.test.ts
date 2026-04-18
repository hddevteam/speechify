import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Module = require('module');

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

interface MockState {
  quickPickItems?: Array<{ label: string; description?: string }>;
  inputBoxOptions?: { value?: string; placeHolder?: string; prompt?: string };
}

async function withVscodeMock<T>(
  callback: () => Promise<T> | T,
  options: {
    language?: string;
    workspaceRoot?: string;
    configValues?: Map<string, unknown>;
    state?: MockState;
  } = {}
): Promise<T> {
  const configuredKeys = new Set((options.configValues || new Map<string, unknown>()).keys());
  const workspaceRoot = options.workspaceRoot;
  const state = options.state;
  const vscodeMock = {
    workspace: {
      workspaceFolders: workspaceRoot ? [{ uri: { fsPath: workspaceRoot } }] : undefined,
      getConfiguration: () => ({
        get: <Value>(section: string, defaultValue: Value) =>
          ((options.configValues || new Map<string, unknown>()).has(section)
            ? (options.configValues || new Map<string, unknown>()).get(section)
            : defaultValue) as Value,
        inspect: (section: string): { workspaceValue?: unknown } | undefined =>
          configuredKeys.has(section)
            ? { workspaceValue: (options.configValues || new Map<string, unknown>()).get(section) }
            : undefined,
        update: async () => undefined
      }),
      openTextDocument: async (filePath: string) => {
        const text = fs.readFileSync(filePath, 'utf8');
        return {
          getText: () => text,
          positionAt: () => ({ line: 0, character: 0 })
        };
      }
    },
    window: {
      showInformationMessage: async () => undefined,
      showQuickPick: async (items: Array<{ label: string; description?: string }>) => {
        state && (state.quickPickItems = items);
        return items.find(item => item.label === 'Finish' || item.label === '完成');
      },
      showInputBox: async (inputOptions: { value?: string; placeHolder?: string; prompt?: string }) => {
        state && (state.inputBoxOptions = inputOptions);
        return undefined;
      },
      showTextDocument: async () => ({
        selection: undefined,
        revealRange: () => undefined
      })
    },
    env: {
      language: options.language || 'en'
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    Selection: class {
      constructor(public anchor: unknown, public active: unknown) {}
    },
    Range: class {
      constructor(public start: unknown, public end: unknown) {}
    },
    TextEditorRevealType: {
      InCenter: 0
    },
    commands: {
      executeCommand: async () => undefined
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

suite('Voice Configuration Service Provider Routing', () => {
  test('should route the configuration wizard directly to Qwen3-TTS when requested', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/voiceConfigurationService')];
      const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

      let called = false;
      const serviceStub = VoiceConfigurationService as unknown as {
        configureQwenTtsSettings: () => Promise<void>;
      };
      const originalConfigureQwenTtsSettings = serviceStub.configureQwenTtsSettings;

      try {
        serviceStub.configureQwenTtsSettings = async () => {
          called = true;
        };

        await VoiceConfigurationService.showConfigurationWizard('qwen3-tts');
        assert.ok(called, 'Qwen3-TTS setup should be opened for a Qwen-specific generation flow');
      } finally {
        serviceStub.configureQwenTtsSettings = originalConfigureQwenTtsSettings;
      }
    });
  });

  test('should route generic voice configuration to the active Qwen3-TTS provider', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/voiceConfigurationService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      let called = false;
      const configStub = ConfigManager as unknown as {
        getSpeechProvider: () => 'azure' | 'cosyvoice' | 'qwen3-tts';
      };
      const serviceStub = VoiceConfigurationService as unknown as {
        configureQwenTtsSettings: () => Promise<void>;
      };
      const originalGetSpeechProvider = configStub.getSpeechProvider;
      const originalConfigureQwenTtsSettings = serviceStub.configureQwenTtsSettings;

      try {
        configStub.getSpeechProvider = () => 'qwen3-tts';
        serviceStub.configureQwenTtsSettings = async () => {
          called = true;
        };

        await VoiceConfigurationService.configureVoiceSettings();
        assert.ok(called, 'The active local provider should receive the generic voice-configuration entrypoint');
      } finally {
        configStub.getSpeechProvider = originalGetSpeechProvider;
        serviceStub.configureQwenTtsSettings = originalConfigureQwenTtsSettings;
      }
    });
  });

  test('should surface the auto-detected Qwen python path in the settings wizard', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-ui-'));
    const detectedPythonPath = path.join(workspaceRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');
    const state: MockState = {};
    const configValues = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['qwenTts.pythonPath', '']
    ]);

    try {
      await withVscodeMock(async () => {
        delete require.cache[require.resolve('../../services/voiceConfigurationService')];
        delete require.cache[require.resolve('../../utils/config')];
        const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

        await VoiceConfigurationService.configureQwenTtsSettings();

        const pythonItem = state.quickPickItems?.find(item => item.label === 'Edit Python Path');
        assert.ok(pythonItem, 'Qwen settings should expose the Python path action');
        assert.strictEqual(
          pythonItem?.description,
          'Auto-detected: ${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
        );
      }, { workspaceRoot, configValues, state });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('should prefill the Qwen python path input with the detected workspace runtime', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-input-'));
    const detectedPythonPath = path.join(workspaceRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');
    const state: MockState = {};
    const configValues = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['qwenTts.pythonPath', '']
    ]);

    try {
      await withVscodeMock(async () => {
        delete require.cache[require.resolve('../../services/voiceConfigurationService')];
        delete require.cache[require.resolve('../../utils/config')];
        const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

        const serviceStub = VoiceConfigurationService as unknown as {
          editQwenTtsPythonPath: () => Promise<void>;
        };

        await serviceStub.editQwenTtsPythonPath();

        assert.strictEqual(
          state.inputBoxOptions?.value,
          '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
        );
        assert.strictEqual(
          state.inputBoxOptions?.placeHolder,
          '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
        );
      }, { workspaceRoot, configValues, state });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('should seed the detected Qwen python path into workspace settings json', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-seed-'));
    const detectedPythonPath = path.join(workspaceRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');
    const configValues = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['qwenTts.pythonPath', '']
    ]);

    try {
      await withVscodeMock(async () => {
        delete require.cache[require.resolve('../../services/voiceConfigurationService')];
        delete require.cache[require.resolve('../../utils/config')];
        const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

        const serviceStub = VoiceConfigurationService as unknown as {
          seedSpeechifyWorkspaceSettings: () => Promise<void>;
        };

        await serviceStub.seedSpeechifyWorkspaceSettings();

        const settingsJson = fs.readFileSync(path.join(workspaceRoot, '.vscode', 'settings.json'), 'utf8');
        assert.ok(
          settingsJson.includes('"speechify.qwenTts.pythonPath": "${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python"'),
          'workspace settings should surface the detected Qwen runtime instead of leaving it empty'
        );
      }, { workspaceRoot, configValues });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
