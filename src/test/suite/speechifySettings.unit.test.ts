import * as assert from 'assert';
import {
  buildSpeechifyWorkspaceSeedEntries,
  getSpeechifyAllSettingPaths,
  getSpeechifyPrimarySettingPaths,
  parseSettingsJsoncText,
  readSpeechifySettingValue,
  SPEECHIFY_WORKSPACE_SETTING_KEYS,
  upsertSpeechifyWorkspaceSettingsJsonText
} from '../../utils/speechifySettings';
import { SpeechifyConfig } from '../../types';

suite('Speechify Settings Workspace Seeding', () => {
  const effectiveValues: SpeechifyConfig = {
    speechProvider: 'cosyvoice',
    azureSpeechServicesKey: '',
    speechServicesRegion: 'eastus',
    voiceName: 'zh-CN-YunyangNeural',
    voiceGender: 'Male',
    voiceStyle: 'friendly',
    voiceRole: '',
    cosyVoiceBaseUrl: 'http://127.0.0.1:50000',
    cosyVoicePythonPath: '${workspaceFolder}/vendor/CosyVoice/.venv310/bin/python',
    cosyVoicePromptAudioPath: '${workspaceFolder}/.speechify/reference-audio/me.wav',
    cosyVoicePromptText: '示例文本',
    cosyVoiceRequestTimeoutSeconds: 900,
    qwenTtsPythonPath: '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python',
    qwenTtsModel: 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16',
    qwenTtsPromptAudioPath: '${workspaceFolder}/.speechify/reference-audio/me-qwen.wav',
    qwenTtsPromptText: 'Qwen 示例文本',
    qwenTtsRequestTimeoutSeconds: 900,
    visionApiKey: '',
    visionEndpoint: '',
    visionDeployment: 'gpt-5.2',
    refinementDeployment: 'gpt-5.2',
    enableTransitions: true,
    transitionType: 'fade',
    autoTrimVideo: true
  };

  test('should seed all missing speechify keys from current effective values', () => {
    const populatedValues: SpeechifyConfig = {
      ...effectiveValues,
      azureSpeechServicesKey: 'azure-key',
      visionApiKey: 'vision-key',
      visionEndpoint: 'https://example.openai.azure.com',
      visionDeployment: 'gpt-5-mini'
    };

    const workspaceValues: Partial<SpeechifyConfig> = {
      speechProvider: 'azure',
      cosyVoicePromptText: '已存在工作区值'
    };

    const entries = buildSpeechifyWorkspaceSeedEntries(populatedValues, workspaceValues);
    const map = new Map(entries);

    assert.ok(!map.has('speechProvider'), 'existing workspace speechProvider should not be overwritten');
    assert.ok(!map.has('cosyVoicePromptText'), 'existing workspace prompt text should not be overwritten');
    assert.strictEqual(map.get('azureSpeechServicesKey'), 'azure-key');
    assert.strictEqual(map.get('cosyVoiceRequestTimeoutSeconds'), 900);
    assert.strictEqual(map.get('qwenTtsRequestTimeoutSeconds'), 900);
    assert.strictEqual(map.get('visionEndpoint'), 'https://example.openai.azure.com');
    assert.strictEqual(map.get('autoTrimVideo'), true);
  });

  test('should explicitly write grouped azure and other default-valued keys into settings json', () => {
    const currentSettings = `{
  "liveServer.settings.port": 5502,
  "speechify.speechProvider": "cosyvoice",
  "speechify.cosyVoiceBaseUrl": "http://127.0.0.1:50000",
  "speechify.cosyVoicePromptAudioPath": "\${workspaceFolder}/vendor/CosyVoice/asset/zero_shot_prompt.wav",
  "speechify.cosyVoicePromptText": "希望你以后能够做的比我还好呦。"
}
`;

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText(currentSettings, effectiveValues);
    const parsed = parseSettingsJsoncText(nextSettings);

    assert.strictEqual(parsed['speechify.provider'], 'cosyvoice');
    assert.strictEqual(parsed['speechify.azure.speechServicesKey'], '');
    assert.strictEqual(parsed['speechify.azure.region'], 'eastus');
    assert.strictEqual(parsed['speechify.azure.voiceName'], 'zh-CN-YunyangNeural');
    assert.strictEqual(parsed['speechify.vision.apiKey'], '');
    assert.strictEqual(parsed['speechify.vision.refinementDeployment'], 'gpt-5.2');
    assert.strictEqual(parsed['speechify.cosyVoice.promptText'], '希望你以后能够做的比我还好呦。');
    assert.ok(!('speechify.speechProvider' in parsed));
    assert.ok(!('speechify.cosyVoicePromptText' in parsed));
    assert.ok(nextSettings.includes('// Speechify quick start:'), 'settings template should include quick-start guidance');
    assert.ok(nextSettings.includes('// Options: "azure" | "cosyvoice" | "qwen3-tts".'), 'provider options should be explained inline');
    assert.ok(nextSettings.includes('// 2. Current provider: cosyvoice. Read that section first.'), 'current provider should be called out in the template');
    assert.ok(nextSettings.includes('// Can be a recorded sample, an audio file, or extracted audio from a video.'), 'local reference media guidance should be explicit');
    assert.ok(nextSettings.indexOf('// Local CosyVoice voice cloning') < nextSettings.indexOf('// Local Qwen3-TTS + MLX-Audio voice cloning'), 'active local provider section should be shown before the other local provider section');
    assert.ok(nextSettings.indexOf('// Local Qwen3-TTS + MLX-Audio voice cloning') < nextSettings.indexOf('// Azure voiceover'), 'other local provider should still appear before inactive cloud provider');
  });

  test('should migrate legacy keys without overwriting existing grouped keys', () => {
    const currentSettings = `{
  "speechify.provider": "cosyvoice",
  "speechify.speechProvider": "azure",
  "speechify.azure.speechServicesKey": "new-key",
  "speechify.azureSpeechServicesKey": "legacy-key",
  "speechify.cosyVoicePromptText": "旧文本",
  "speechify.cosyVoice.promptText": "新文本"
}
`;

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText(currentSettings, effectiveValues);
    const parsed = parseSettingsJsoncText(nextSettings);

    assert.strictEqual(parsed['speechify.provider'], 'cosyvoice');
    assert.strictEqual(parsed['speechify.azure.speechServicesKey'], 'new-key');
    assert.strictEqual(parsed['speechify.cosyVoice.promptText'], '新文本');
    assert.ok(!('speechify.speechProvider' in parsed));
    assert.ok(!('speechify.azureSpeechServicesKey' in parsed));
    assert.ok(!('speechify.cosyVoicePromptText' in parsed));
  });

  test('should prefer grouped config keys and fall back to legacy keys at runtime', () => {
    const values = new Map<string, unknown>([
      ['provider', 'cosyvoice'],
      ['speechProvider', 'azure'],
      ['azure.region', 'westus2'],
      ['speechServicesRegion', 'eastus']
    ]);
    const configuredKeys = new Set<string>(['provider', 'speechProvider', 'azure.region', 'speechServicesRegion']);
    const fakeConfig = {
      get<T>(section: string, defaultValue?: T): T {
        return (values.has(section) ? values.get(section) : defaultValue) as T;
      },
      inspect(section: string): { workspaceValue?: unknown } | undefined {
        if (!configuredKeys.has(section)) {
          return undefined;
        }

        return { workspaceValue: values.get(section) };
      }
    };

    assert.strictEqual(readSpeechifySettingValue(fakeConfig as never, 'speechProvider', 'azure'), 'cosyvoice');
    assert.strictEqual(readSpeechifySettingValue(fakeConfig as never, 'speechServicesRegion', 'eastus'), 'westus2');

    configuredKeys.delete('azure.region');
    values.delete('azure.region');
    assert.strictEqual(readSpeechifySettingValue(fakeConfig as never, 'speechServicesRegion', 'eastus'), 'eastus');
  });

  test('should include azure chinese voice examples in the settings template', () => {
    const azureValues: SpeechifyConfig = {
      ...effectiveValues,
      speechProvider: 'azure'
    };

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText('{}\n', azureValues);

    assert.ok(nextSettings.includes('zh-CN-YunyangNeural'), 'template should include common Chinese Azure voice examples');
    assert.ok(nextSettings.includes('zh-CN-XiaoxiaoNeural'), 'template should include multiple Azure Chinese voice candidates');
    assert.ok(nextSettings.includes('// Start here for your current provider.'), 'active provider section should be highlighted');
    assert.ok(nextSettings.indexOf('// Azure voiceover') < nextSettings.indexOf('// Local CosyVoice voice cloning'), 'azure section should come before local providers when Azure is active');
    assert.ok(nextSettings.indexOf('// Local CosyVoice voice cloning') < nextSettings.indexOf('// Local Qwen3-TTS + MLX-Audio voice cloning'), 'CosyVoice should appear before Qwen when Azure is active');
  });

  test('should order the Qwen3-TTS section first when it is the active provider', () => {
    const qwenValues: SpeechifyConfig = {
      ...effectiveValues,
      speechProvider: 'qwen3-tts'
    };

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText('{}\n', qwenValues);

    assert.ok(nextSettings.includes('// 2. Current provider: qwen3-tts. Read that section first.'));
    assert.ok(nextSettings.indexOf('// Local Qwen3-TTS + MLX-Audio voice cloning') < nextSettings.indexOf('// Local CosyVoice voice cloning'));
    assert.ok(nextSettings.indexOf('// Local Qwen3-TTS + MLX-Audio voice cloning') < nextSettings.indexOf('// Azure voiceover'));
  });

  test('should keep the local CosyVoice timeout default aligned at 900 seconds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        configuration: {
          properties: Record<string, { default?: unknown }>;
        };
      };
    };

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText('{}\n', effectiveValues);

    assert.strictEqual(
      pkg.contributes.configuration.properties['speechify.cosyVoice.requestTimeoutSeconds']?.default,
      900
    );
    assert.strictEqual(
      pkg.contributes.configuration.properties['speechify.cosyVoiceRequestTimeoutSeconds']?.default,
      900
    );
    assert.ok(
      nextSettings.includes('// Default: 900. Increase this first if local zero-shot feels slow.'),
      'settings template should explain the 900-second default'
    );
  });

  test('should keep grouped workspace setting paths aligned with non-deprecated package.json speechify properties', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        configuration: {
          properties: Record<string, { markdownDeprecationMessage?: string }>;
        };
      };
    };

    const primaryPackageKeys = Object.entries(pkg.contributes.configuration.properties)
      .filter(([key]) => key.startsWith('speechify.'))
      .filter(([, value]) => !value.markdownDeprecationMessage)
      .map(([key]) => key)
      .sort();
    const primaryWorkspacePaths = getSpeechifyPrimarySettingPaths().sort();

    assert.deepStrictEqual(primaryWorkspacePaths, primaryPackageKeys);
  });

  test('should keep all speechify setting paths aligned with package.json including legacy aliases', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: { configuration: { properties: Record<string, unknown> } };
    };

    const packageKeys = Object.keys(pkg.contributes.configuration.properties)
      .filter(key => key.startsWith('speechify.'))
      .sort();
    const declaredPaths = getSpeechifyAllSettingPaths().sort();

    assert.deepStrictEqual(declaredPaths, packageKeys);
    assert.strictEqual(SPEECHIFY_WORKSPACE_SETTING_KEYS.length, getSpeechifyPrimarySettingPaths().length);
  });
});
