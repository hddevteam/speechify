import * as assert from 'assert';
import { buildSpeechifyWorkspaceSeedEntries, SPEECHIFY_WORKSPACE_SETTING_KEYS, upsertSpeechifyWorkspaceSettingsJsonText } from '../../utils/speechifySettings';
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
    cosyVoiceRequestTimeoutSeconds: 300,
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
    assert.strictEqual(map.get('cosyVoiceRequestTimeoutSeconds'), 300);
    assert.strictEqual(map.get('visionEndpoint'), 'https://example.openai.azure.com');
    assert.strictEqual(map.get('autoTrimVideo'), true);
  });

  test('should explicitly write azure and other default-valued keys into settings json', () => {
    const currentSettings = `{
  "liveServer.settings.port": 5502,
  "speechify.speechProvider": "cosyvoice",
  "speechify.cosyVoiceBaseUrl": "http://127.0.0.1:50000",
  "speechify.cosyVoicePromptAudioPath": "\${workspaceFolder}/vendor/CosyVoice/asset/zero_shot_prompt.wav",
  "speechify.cosyVoicePromptText": "希望你以后能够做的比我还好呦。"
}
`;

    const nextSettings = upsertSpeechifyWorkspaceSettingsJsonText(currentSettings, effectiveValues);
    const parsed = JSON.parse(nextSettings) as Record<string, unknown>;

    assert.strictEqual(parsed['speechify.azureSpeechServicesKey'], '');
    assert.strictEqual(parsed['speechify.speechServicesRegion'], 'eastus');
    assert.strictEqual(parsed['speechify.voiceName'], 'zh-CN-YunyangNeural');
    assert.strictEqual(parsed['speechify.visionApiKey'], '');
    assert.strictEqual(parsed['speechify.refinementDeployment'], 'gpt-5.2');
    assert.strictEqual(parsed['speechify.cosyVoicePromptText'], '希望你以后能够做的比我还好呦。');
  });

  test('should keep workspace seed key list aligned with package.json speechify properties', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: { configuration: { properties: Record<string, unknown> } };
    };

    const packageKeys = Object.keys(pkg.contributes.configuration.properties)
      .filter(key => key.startsWith('speechify.'))
      .map(key => key.replace(/^speechify\./, ''))
      .sort();
    const workspaceSeedKeys = [...SPEECHIFY_WORKSPACE_SETTING_KEYS].sort();

    assert.deepStrictEqual(workspaceSeedKeys, packageKeys);
  });
});
