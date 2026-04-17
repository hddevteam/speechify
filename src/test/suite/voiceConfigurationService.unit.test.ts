import * as assert from 'assert';
import Module = require('module');

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

async function withVscodeMock<T>(callback: () => Promise<T> | T): Promise<T> {
  const vscodeMock = {
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({
        get: <Value>(_: string, defaultValue: Value) => defaultValue,
        update: async () => undefined
      })
    },
    window: {
      showInformationMessage: async () => undefined
    },
    env: {
      language: 'en'
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
});
