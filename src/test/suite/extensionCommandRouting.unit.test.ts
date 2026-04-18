import * as assert from 'assert';
import Module = require('module');

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

suite('Extension Command Routing', () => {
  test('should generate with Qwen without opening the configuration wizard when local preflight is disabled', async () => {
    const registeredCommands = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    let showConfigurationWizardCalls = 0;
    const convertCalls: Array<{
      text: string;
      sourceFilePath: string;
      options: { providerOverride?: string } | undefined;
    }> = [];

    const vscodeMock = {
      window: {
        activeTextEditor: {
          document: {
            uri: { fsPath: '/tmp/demo.md' },
            getText: (selection?: unknown) => selection ? '选中的测试文本' : '全文测试文本'
          },
          selection: {
            isEmpty: false
          }
        },
        showErrorMessage: async () => undefined,
        showInformationMessage: async () => undefined,
        onDidChangeActiveTextEditor: () => ({ dispose: () => undefined })
      },
      workspace: {
        onDidSaveTextDocument: () => ({ dispose: () => undefined }),
        onDidOpenTextDocument: () => ({ dispose: () => undefined }),
        openTextDocument: async () => ({
          getText: () => 'URI 测试文本'
        })
      },
      commands: {
        registerCommand: (command: string, callback: (...args: unknown[]) => Promise<void> | void) => {
          registeredCommands.set(command, callback);
          return { dispose: () => undefined };
        },
        executeCommand: async () => undefined
      },
      env: {
        openExternal: async () => undefined
      },
      Uri: {
        file: (fsPath: string) => ({ fsPath })
      }
    };

    const speechServiceMock = {
      SpeechService: {
        setExtensionContext: () => undefined,
        showConfigurationWizard: async () => {
          showConfigurationWizardCalls += 1;
        },
        convertTextToSpeech: async (
          text: string,
          sourceFilePath: string,
          options?: { providerOverride?: string }
        ) => {
          convertCalls.push({ text, sourceFilePath, options });
          return {
            success: true,
            processedChunks: 1,
            totalChunks: 1,
            outputPaths: ['/tmp/demo_speechify.wav'],
            errors: []
          };
        }
      }
    };

    const configMock = {
      ConfigManager: {
        requiresPreflightConfiguration: () => false,
        isConfigurationComplete: () => false
      }
    };

    const i18nMock = {
      I18n: {
        t: (key: string, ...args: string[]) => `${key}:${args.join('|')}`
      }
    };

    ModuleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
      if (request === 'vscode') {
        return vscodeMock;
      }

      if (request === './services/speechService') {
        return speechServiceMock;
      }

      if (request === './utils/config') {
        return configMock;
      }

      if (request === './i18n') {
        return i18nMock;
      }

      return originalModuleLoad.call(this, request, parent, isMain);
    };

    try {
      delete require.cache[require.resolve('../../extension')];
      const extension = require('../../extension') as typeof import('../../extension');
      await extension.activate({ subscriptions: [] } as never);

      const command = registeredCommands.get('extension.generateQwenAudio');
      assert.ok(command, 'Qwen generate command should be registered');

      await command?.();

      assert.strictEqual(showConfigurationWizardCalls, 0, 'Qwen generation should not bounce into the setup wizard');
      assert.strictEqual(convertCalls.length, 1, 'Qwen generation should proceed into speech synthesis');
      assert.strictEqual(convertCalls[0]?.text, '选中的测试文本');
      assert.strictEqual(convertCalls[0]?.sourceFilePath, '/tmp/demo.md');
      assert.strictEqual(convertCalls[0]?.options?.providerOverride, 'qwen3-tts');
    } finally {
      ModuleInternals._load = originalModuleLoad;
    }
  });

  test('should prompt for a Qwen python path and retry generation when the runtime is missing', async () => {
    const registeredCommands = new Map<string, (...args: unknown[]) => Promise<void> | void>();
    const convertCalls: Array<{
      text: string;
      sourceFilePath: string;
      options: { providerOverride?: string } | undefined;
    }> = [];
    let selectPythonPathCalls = 0;
    const errorMessages: string[] = [];

    const vscodeMock = {
      window: {
        activeTextEditor: {
          document: {
            uri: { fsPath: '/tmp/demo.md' },
            getText: (selection?: unknown) => selection ? '选中的测试文本' : '全文测试文本'
          },
          selection: {
            isEmpty: false
          }
        },
        showErrorMessage: async (message: string, ...items: string[]) => {
          errorMessages.push(message);
          return items[0];
        },
        showInformationMessage: async () => undefined,
        onDidChangeActiveTextEditor: () => ({ dispose: () => undefined })
      },
      workspace: {
        onDidSaveTextDocument: () => ({ dispose: () => undefined }),
        onDidOpenTextDocument: () => ({ dispose: () => undefined }),
        openTextDocument: async () => ({
          getText: () => 'URI 测试文本'
        })
      },
      commands: {
        registerCommand: (command: string, callback: (...args: unknown[]) => Promise<void> | void) => {
          registeredCommands.set(command, callback);
          return { dispose: () => undefined };
        },
        executeCommand: async () => undefined
      },
      env: {
        language: 'zh-cn',
        openExternal: async () => undefined
      },
      Uri: {
        file: (fsPath: string) => ({ fsPath })
      }
    };

    const speechServiceMock = {
      SpeechService: {
        setExtensionContext: () => undefined,
        showConfigurationWizard: async () => undefined,
        configureQwenTtsSettings: async () => undefined,
        selectQwenTtsPythonPathFromDialog: async () => {
          selectPythonPathCalls += 1;
          return '/tmp/qwen-python';
        },
        convertTextToSpeech: async (
          text: string,
          sourceFilePath: string,
          options?: { providerOverride?: string }
        ) => {
          convertCalls.push({ text, sourceFilePath, options });
          if (convertCalls.length === 1) {
            return {
              success: false,
              processedChunks: 0,
              totalChunks: 1,
              outputPaths: [],
              errors: ['Chunk 1: Qwen3-TTS Python runtime not found: /missing/python']
            };
          }

          return {
            success: true,
            processedChunks: 1,
            totalChunks: 1,
            outputPaths: ['/tmp/demo_speechify.wav'],
            errors: []
          };
        }
      }
    };

    const configMock = {
      ConfigManager: {
        requiresPreflightConfiguration: () => false,
        isConfigurationComplete: () => false
      }
    };

    const i18nMock = {
      I18n: {
        t: (key: string, ...args: string[]) => `${key}:${args.join('|')}`
      }
    };

    ModuleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
      if (request === 'vscode') {
        return vscodeMock;
      }

      if (request === './services/speechService') {
        return speechServiceMock;
      }

      if (request === './utils/config') {
        return configMock;
      }

      if (request === './i18n') {
        return i18nMock;
      }

      return originalModuleLoad.call(this, request, parent, isMain);
    };

    try {
      delete require.cache[require.resolve('../../extension')];
      const extension = require('../../extension') as typeof import('../../extension');
      await extension.activate({ subscriptions: [] } as never);

      const command = registeredCommands.get('extension.generateQwenAudio');
      assert.ok(command, 'Qwen generate command should be registered');

      await command?.();

      assert.strictEqual(selectPythonPathCalls, 1, 'runtime recovery should open the python picker once');
      assert.strictEqual(convertCalls.length, 2, 'generation should retry once after selecting a python path');
      assert.ok(
        errorMessages.some(message => message.includes('errors.speechGenerationFailed:Chunk 1: Qwen3-TTS Python runtime not found: /missing/python')),
        'the runtime resolution failure should be surfaced in the recovery prompt'
      );
    } finally {
      ModuleInternals._load = originalModuleLoad;
    }
  });
});
