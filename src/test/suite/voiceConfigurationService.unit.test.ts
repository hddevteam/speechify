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
  quickPickOptions?: { title?: string; placeHolder?: string } | undefined;
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
  const configValues = options.configValues || new Map<string, unknown>();
  const configuredKeys = new Set(configValues.keys());
  const workspaceRoot = options.workspaceRoot;
  const state = options.state;
  const vscodeMock = {
    workspace: {
      workspaceFolders: workspaceRoot ? [{ uri: { fsPath: workspaceRoot } }] : undefined,
      getConfiguration: () => ({
        get: <Value>(section: string, defaultValue: Value) =>
          (configValues.has(section)
            ? configValues.get(section)
            : defaultValue) as Value,
        inspect: (section: string): { workspaceValue?: unknown } | undefined =>
          configuredKeys.has(section)
            ? { workspaceValue: configValues.get(section) }
            : undefined,
        update: async (section: string, value: unknown) => {
          configValues.set(section, value);
          configuredKeys.add(section);
          return undefined;
        }
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
      showQuickPick: async (
        items: Array<{ label: string; description?: string }>,
        quickPickOptions?: { title?: string; placeHolder?: string }
      ) => {
        state && (state.quickPickItems = items);
        state && (state.quickPickOptions = quickPickOptions);
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
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2
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
  test('should expose inline editable fields in the local model workbench state', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-local-workbench-'));
    const detectedPythonPath = path.join(workspaceRoot, 'vendor', 'Qwen3-TTS', '.venv312', 'bin', 'python');
    fs.mkdirSync(path.dirname(detectedPythonPath), { recursive: true });
    fs.writeFileSync(detectedPythonPath, '');
    const configValues = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['cosyVoice.baseUrl', 'http://127.0.0.1:50000'],
      ['qwenTts.pythonPath', ''],
      ['qwenTts.model', 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16']
    ]);

    try {
      await withVscodeMock(async () => {
        delete require.cache[require.resolve('../../services/voiceConfigurationService')];
        delete require.cache[require.resolve('../../utils/config')];
        const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

        const serviceStub = VoiceConfigurationService as unknown as {
          getLocalReferenceWorkbenchState: (target: 'cosyvoice' | 'qwen3-tts' | 'both') => Promise<{
            providers: Array<{
              id: string;
              editableFields: Array<{ id: string; value: string; placeholder?: string }>;
            }>;
          }>;
        };

        const state = await serviceStub.getLocalReferenceWorkbenchState('both');
        const cosyVoice = state.providers.find(provider => provider.id === 'cosyvoice');
        const qwen = state.providers.find(provider => provider.id === 'qwen3-tts');

        assert.ok(cosyVoice, 'CosyVoice provider card should exist');
        assert.ok(qwen, 'Qwen3-TTS provider card should exist');
        assert.deepStrictEqual(
          cosyVoice?.editableFields.map(field => field.id),
          ['cosyvoice-base-url', 'cosyvoice-prompt-text']
        );
        assert.deepStrictEqual(
          qwen?.editableFields.map(field => field.id),
          ['qwen-python-path', 'qwen-model', 'qwen-prompt-text']
        );
        assert.strictEqual(
          qwen?.editableFields.find(field => field.id === 'qwen-python-path')?.value,
          '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
        );
      }, { workspaceRoot, configValues });
    } finally {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('should save workbench fields directly into project configuration', async () => {
    const configValues = new Map<string, unknown>([
      ['provider', 'qwen3-tts'],
      ['cosyVoice.baseUrl', 'http://127.0.0.1:50000'],
      ['qwenTts.pythonPath', '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'],
      ['qwenTts.model', 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16']
    ]);

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/voiceConfigurationService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

      const serviceStub = VoiceConfigurationService as unknown as {
        saveLocalReferenceWorkbenchField: (
          fieldId: 'cosyvoice-base-url' | 'cosyvoice-prompt-text' | 'qwen-python-path' | 'qwen-model' | 'qwen-prompt-text',
          value: string
        ) => Promise<void>;
      };

      await serviceStub.saveLocalReferenceWorkbenchField('qwen-python-path', '/tmp/qwen-python');
      await serviceStub.saveLocalReferenceWorkbenchField('qwen-model', 'mlx-community/Qwen3-TTS-4B-Instruct-bf16');
      await serviceStub.saveLocalReferenceWorkbenchField('cosyvoice-prompt-text', '新的参考文本');

      assert.strictEqual(configValues.get('qwenTts.pythonPath'), '/tmp/qwen-python');
      assert.strictEqual(configValues.get('qwenTts.model'), 'mlx-community/Qwen3-TTS-4B-Instruct-bf16');
      assert.strictEqual(configValues.get('cosyVoice.promptText'), '新的参考文本');
    }, { configValues });
  });

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

  test('should localize the speech backend picker in Chinese', async () => {
    const state: MockState = {};

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/voiceConfigurationService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

      await VoiceConfigurationService.configureAzureSettings();

      assert.strictEqual(state.quickPickOptions?.title, '选择语音后端');
      assert.strictEqual(state.quickPickOptions?.placeHolder, '选择要配置的语音后端');
      assert.deepStrictEqual(
        state.quickPickItems?.map(item => item.label),
        ['Azure Speech', 'CosyVoice（本地）', 'Qwen3-TTS + MLX-Audio（本地）']
      );
    }, {
      language: 'zh-cn',
      configValues: new Map<string, unknown>([['provider', 'azure']]),
      state
    });
  });

  test('should localize Azure voice selection helpers in Chinese', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/voiceConfigurationService')];
      const { VoiceConfigurationService } = require('../../services/voiceConfigurationService') as typeof import('../../services/voiceConfigurationService');

      const serviceStub = VoiceConfigurationService as unknown as {
        getSelectLanguageStepTitle: () => string;
        getSelectVoiceStepTitle: (localeName: string) => string;
        getSelectVoiceStyleStepTitle: () => string;
        getSelectStylePlaceholder: (voiceDisplayName: string) => string;
        getVoiceCountDetail: (count: number) => string;
        getVoiceStylesDetail: (styles: string[]) => string;
        getDefaultStyleOnlyDetail: () => string;
        getStyleDescription: (style: string) => string;
      };

      assert.strictEqual(serviceStub.getSelectLanguageStepTitle(), '第 1/3 步：选择语言');
      assert.strictEqual(serviceStub.getSelectVoiceStepTitle('zh-CN'), '第 2/3 步：选择语音 (zh-CN)');
      assert.strictEqual(serviceStub.getSelectVoiceStyleStepTitle(), '第 3/3 步：选择语音风格');
      assert.strictEqual(serviceStub.getSelectStylePlaceholder('Xiaoxiao'), '选择 Xiaoxiao 的语音风格');
      assert.strictEqual(serviceStub.getVoiceCountDetail(12), '共 12 个语音可选');
      assert.strictEqual(serviceStub.getVoiceStylesDetail(['cheerful', 'sad']), '支持风格：cheerful, sad');
      assert.strictEqual(serviceStub.getDefaultStyleOnlyDetail(), '仅默认风格');
      assert.strictEqual(serviceStub.getStyleDescription('cheerful'), '轻快愉悦');
    }, { language: 'zh-cn' });
  });
});
