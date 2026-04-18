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
        menus: Record<string, Array<{ command?: string; group?: string; submenu?: string }>>;
      };
    };

    const topLevelSpeechifySubmenus = new Set(
      (pkg.contributes.menus['speechify.submenu'] || [])
        .map(item => item.submenu)
        .filter((submenu): submenu is string => Boolean(submenu))
    );
    const localModelsMenuItems = pkg.contributes.menus['speechify.localModelsSubmenu'] || [];
    const cosyGenerateItem = localModelsMenuItems.find(item => item.command === 'extension.generateLocalAudio');
    const qwenGenerateItem = localModelsMenuItems.find(item => item.command === 'extension.generateQwenAudio');
    const workbenchItem = localModelsMenuItems.find(item => item.command === 'extension.openSpeechifyLocalReferenceWorkbench');

    assert.ok(topLevelSpeechifySubmenus.has('speechify.localModelsSubmenu'));
    assert.strictEqual(cosyGenerateItem?.group, '1_generate@1');
    assert.strictEqual(qwenGenerateItem?.group, '1_generate@2');
    assert.strictEqual(workbenchItem?.group, '2_settings@1');
  });

  test('should expose a single local reference workbench command instead of a shared submenu', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        menus: Record<string, Array<{ command?: string; group?: string; submenu?: string }>>;
      };
    };

    const localModelsMenuItems = pkg.contributes.menus['speechify.localModelsSubmenu'] || [];
    const localReferenceMenuItems = pkg.contributes.menus['speechify.localReferenceSubmenu'] || [];
    const workbenchItem = localModelsMenuItems.find(item => item.command === 'extension.openSpeechifyLocalReferenceWorkbench');

    assert.strictEqual(workbenchItem?.group, '2_settings@1');
    assert.strictEqual(localReferenceMenuItems.length, 0);
  });

  test('should keep local provider configuration inside the workbench instead of separate submenus', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      contributes: {
        submenus: Array<{ id: string }>;
        menus: Record<string, Array<{ command?: string; group?: string }>>;
      };
    };

    const submenuIds = new Set(pkg.contributes.submenus.map(item => item.id));
    assert.ok(!submenuIds.has('speechify.localCosyVoiceSubmenu'));
    assert.ok(!submenuIds.has('speechify.localQwenSubmenu'));
  });

  test('should label audio generation commands as voiceover generation', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const en = require('../../../package.nls.json') as Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const zhCn = require('../../../package.nls.zh-cn.json') as Record<string, string>;

    assert.strictEqual(en['speechify.command.generateAzureAudio'], 'Azure: Generate Voiceover');
    assert.strictEqual(en['speechify.command.generateLocalAudio'], 'Local CosyVoice: Generate Voiceover');
    assert.strictEqual(en['speechify.command.generateQwenAudio'], 'Local Qwen3-TTS: Generate Voiceover');
    assert.strictEqual(en['speechify.command.openLocalReferenceWorkbench'], 'Configure Local Models');
    assert.strictEqual(en['speechify.command.voiceSettings'], 'View Azure Configuration');
    assert.strictEqual(en['speechify.command.configureCosyVoice'], 'Local CosyVoice: Provider Settings');
    assert.strictEqual(en['speechify.command.configureQwenTts'], 'Local Qwen3-TTS: Provider Settings');
    assert.strictEqual(en['speechify.menu.localModels'], 'Local Models');
    assert.strictEqual(zhCn['speechify.command.generateAzureAudio'], 'Azure：生成配音');
    assert.strictEqual(zhCn['speechify.command.generateLocalAudio'], '本地 CosyVoice：生成配音');
    assert.strictEqual(zhCn['speechify.command.generateQwenAudio'], '本地 Qwen3-TTS：生成配音');
    assert.strictEqual(zhCn['speechify.command.openLocalReferenceWorkbench'], '配置本地模型');
    assert.strictEqual(zhCn['speechify.command.voiceSettings'], '查看当前 Azure 配置');
    assert.strictEqual(zhCn['speechify.command.configureCosyVoice'], '本地 CosyVoice：提供方设置');
    assert.strictEqual(zhCn['speechify.command.configureQwenTts'], '本地 Qwen3-TTS：提供方设置');
    assert.strictEqual(zhCn['speechify.menu.localModels'], '本地模型');
  });
});
