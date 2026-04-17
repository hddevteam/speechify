import * as assert from 'assert';

suite('Package Manifest Menu Layout', () => {
  test('should keep Azure-only actions inside the Azure submenu', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        menus: Record<string, Array<{ command?: string; group?: string }>>;
      };
    };

    const topLevelSpeechifyCommands = new Set(
      (pkg.contributes.menus['speechify.submenu'] || [])
        .map(item => item.command)
        .filter((command): command is string => Boolean(command))
    );
    const azureCommands = new Set(
      (pkg.contributes.menus['speechify.azureSubmenu'] || [])
        .map(item => item.command)
        .filter((command): command is string => Boolean(command))
    );
    const azureMenuItems = pkg.contributes.menus['speechify.azureSubmenu'] || [];
    const alignItem = azureMenuItems.find(item => item.command === 'extension.convertToVideo');

    assert.ok(azureCommands.has('extension.convertToVideo'));
    assert.ok(azureCommands.has('extension.configureSpeechifyVisionSettings'));
    assert.ok(azureCommands.has('extension.showSpeechifyVoiceSettings'));
    assert.strictEqual(alignItem?.group, '1_generate@2');
    assert.ok(!topLevelSpeechifyCommands.has('extension.convertToVideo'));
    assert.ok(!topLevelSpeechifyCommands.has('extension.configureSpeechifyVisionSettings'));
    assert.ok(!topLevelSpeechifyCommands.has('extension.showSpeechifyVoiceSettings'));
  });

  test('should keep local capture actions in the local submenu action block', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        menus: Record<string, Array<{ command?: string; group?: string }>>;
      };
    };

    const localMenuItems = pkg.contributes.menus['speechify.localSubmenu'] || [];
    const topLevelSpeechifyCommands = new Set(
      (pkg.contributes.menus['speechify.submenu'] || [])
        .map(item => item.command)
        .filter((command): command is string => Boolean(command))
    );
    const recordItem = localMenuItems.find(item => item.command === 'extension.recordSpeechifyCosyVoiceReference');
    const settingsJsonItem = localMenuItems.find(item => item.command === 'extension.openSpeechifySettingsJson');

    assert.strictEqual(recordItem?.group, '1_generate@2');
    assert.strictEqual(settingsJsonItem, undefined);
    assert.ok(topLevelSpeechifyCommands.has('extension.openSpeechifySettingsJson'));
  });

  test('should expose Qwen3-TTS in its own local submenu', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        menus: Record<string, Array<{ command?: string; group?: string; submenu?: string }>>;
      };
    };

    const topLevelSpeechifySubmenus = new Set(
      (pkg.contributes.menus['speechify.submenu'] || [])
        .map(item => item.submenu)
        .filter((submenu): submenu is string => Boolean(submenu))
    );
    const qwenMenuItems = pkg.contributes.menus['speechify.qwenSubmenu'] || [];
    const generateItem = qwenMenuItems.find(item => item.command === 'extension.generateQwenAudio');
    const recordItem = qwenMenuItems.find(item => item.command === 'extension.recordSpeechifyQwenTtsReference');
    const settingsItem = qwenMenuItems.find(item => item.command === 'extension.configureSpeechifyQwenTtsSettings');

    assert.ok(topLevelSpeechifySubmenus.has('speechify.qwenSubmenu'));
    assert.strictEqual(generateItem?.group, '1_generate@1');
    assert.strictEqual(recordItem?.group, '1_generate@2');
    assert.strictEqual(settingsItem?.group, '2_settings@1');
  });

  test('should label audio generation commands as voiceover generation', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const en = require('../../../package.nls.json') as Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zhCn = require('../../../package.nls.zh-cn.json') as Record<string, string>;

    assert.strictEqual(en['speechify.command.generateAzureAudio'], 'Azure: Generate Voiceover');
    assert.strictEqual(en['speechify.command.generateLocalAudio'], 'Local CosyVoice: Generate Voiceover');
    assert.strictEqual(en['speechify.command.generateQwenAudio'], 'Local Qwen3-TTS: Generate Voiceover');
    assert.strictEqual(en['speechify.command.voiceSettings'], 'View Azure Configuration');
    assert.strictEqual(en['speechify.command.configureCosyVoice'], 'Local CosyVoice: Set Reference Voice');
    assert.strictEqual(en['speechify.command.configureQwenTts'], 'Local Qwen3-TTS: Set Reference Voice');
    assert.strictEqual(en['speechify.command.recordQwenTts'], 'Local Qwen3-TTS: Record Reference Audio');
    assert.strictEqual(zhCn['speechify.command.generateAzureAudio'], 'Azure：生成配音');
    assert.strictEqual(zhCn['speechify.command.generateLocalAudio'], '本地 CosyVoice：生成配音');
    assert.strictEqual(zhCn['speechify.command.generateQwenAudio'], '本地 Qwen3-TTS：生成配音');
    assert.strictEqual(zhCn['speechify.command.voiceSettings'], '查看当前 Azure 配置');
    assert.strictEqual(zhCn['speechify.command.configureCosyVoice'], '本地 CosyVoice：设置参考声音');
    assert.strictEqual(zhCn['speechify.command.configureQwenTts'], '本地 Qwen3-TTS：设置参考声音');
    assert.strictEqual(zhCn['speechify.command.recordQwenTts'], '本地 Qwen3-TTS：录制参考音频');
  });
});
