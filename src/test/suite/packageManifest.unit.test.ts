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

  test('should label audio generation commands as voiceover generation', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const en = require('../../../package.nls.json') as Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zhCn = require('../../../package.nls.zh-cn.json') as Record<string, string>;

    assert.strictEqual(en['speechify.command.generateAzureAudio'], 'Azure: Generate Voiceover');
    assert.strictEqual(en['speechify.command.generateLocalAudio'], 'Local CosyVoice: Generate Voiceover');
    assert.strictEqual(en['speechify.command.voiceSettings'], 'View Azure Configuration');
    assert.strictEqual(zhCn['speechify.command.generateAzureAudio'], 'Azure：生成配音');
    assert.strictEqual(zhCn['speechify.command.generateLocalAudio'], '本地 CosyVoice：生成配音');
    assert.strictEqual(zhCn['speechify.command.voiceSettings'], '查看当前 Azure 配置');
  });
});
