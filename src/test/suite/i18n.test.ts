import * as assert from 'assert';
import { I18n } from '../../i18n';

suite('Internationalization Tests', () => {
    
    test('should initialize I18n singleton correctly', () => {
        const i18n1 = I18n.getInstance();
        const i18n2 = I18n.getInstance();
        
        assert.strictEqual(i18n1, i18n2, 'I18n should be a singleton');
        assert.ok(i18n1, 'I18n instance should be created');
    });

    test('should translate basic message keys', () => {
        const extensionActivated = I18n.t('messages.extensionActivated');
        assert.ok(extensionActivated, 'Translation should return a value');
        assert.notStrictEqual(extensionActivated, 'messages.extensionActivated', 'Translation should not return the key itself');
        assert.strictEqual(typeof extensionActivated, 'string', 'Translation should return a string');
    });

    test('should handle interpolation with arguments', () => {
        const fileName = 'test.txt';
        const message = I18n.t('notifications.success.speechGenerated', fileName);
        
        assert.ok(message.includes(fileName), 'Interpolated message should contain the argument');
        assert.notStrictEqual(message, 'notifications.success.speechGenerated', 'Translation should not return the key');
    });

    test('should handle multiple argument interpolation', () => {
        const currentChunk = '2';
        const totalChunks = '5';
        const message = I18n.t('progress.processingChunk', currentChunk, totalChunks);
        
        assert.ok(message.includes(currentChunk), 'Message should contain first argument');
        assert.ok(message.includes(totalChunks), 'Message should contain second argument');
    });

    test('should return key for missing translations', () => {
        // Test with a key that definitely doesn't exist by using any type assertion
        const nonExistentKey = 'nonexistent.key';
        const result = I18n.t(nonExistentKey as unknown as Parameters<typeof I18n.t>[0]);
        
        assert.strictEqual(result, nonExistentKey, 'Missing translation should return the key itself');
    });

    test('should handle empty or undefined arguments gracefully', () => {
        const message = I18n.t('messages.extensionActivated', '');
        assert.ok(message, 'Should handle empty argument');
        assert.strictEqual(typeof message, 'string', 'Should return string with empty argument');
    });

    test('should translate error messages', () => {
        const noActiveEditor = I18n.t('errors.noActiveEditor');
        const noTextSelected = I18n.t('errors.noTextSelected');
        const configIncomplete = I18n.t('errors.configurationIncomplete');
        
        assert.ok(noActiveEditor, 'Error message should be translated');
        assert.ok(noTextSelected, 'Error message should be translated');
        assert.ok(configIncomplete, 'Error message should be translated');
        
        assert.notStrictEqual(noActiveEditor, 'errors.noActiveEditor', 'Translation should not be the key');
        assert.notStrictEqual(noTextSelected, 'errors.noTextSelected', 'Translation should not be the key');
        assert.notStrictEqual(configIncomplete, 'errors.configurationIncomplete', 'Translation should not be the key');
    });

    test('should translate command titles', () => {
        const speechifyTitle = I18n.t('commands.speechify.title');
        const voiceSettingsTitle = I18n.t('commands.voiceSettings.title');
        const configureVoiceTitle = I18n.t('commands.configureVoice.title');
        
        assert.ok(speechifyTitle, 'Command title should be translated');
        assert.ok(voiceSettingsTitle, 'Command title should be translated');
        assert.ok(configureVoiceTitle, 'Command title should be translated');
        
        assert.strictEqual(typeof speechifyTitle, 'string', 'Command title should be string');
        assert.strictEqual(typeof voiceSettingsTitle, 'string', 'Command title should be string');
        assert.strictEqual(typeof configureVoiceTitle, 'string', 'Command title should be string');
    });

    test('should translate configuration prompts', () => {
        const subscriptionKeyPrompt = I18n.t('config.prompts.subscriptionKey');
        const regionPrompt = I18n.t('config.prompts.region');
        const selectVoicePrompt = I18n.t('config.prompts.selectVoice');
        
        assert.ok(subscriptionKeyPrompt, 'Config prompt should be translated');
        assert.ok(regionPrompt, 'Config prompt should be translated');
        assert.ok(selectVoicePrompt, 'Config prompt should be translated');
    });

    test('should translate progress messages', () => {
        const convertingProgress = I18n.t('progress.convertingToSpeech');
        const processingChunk = I18n.t('progress.processingChunk', '1', '3');
        
        assert.ok(convertingProgress, 'Progress message should be translated');
        assert.ok(processingChunk, 'Progress message should be translated');
        assert.ok(processingChunk.includes('1'), 'Progress message should contain interpolated values');
        assert.ok(processingChunk.includes('3'), 'Progress message should contain interpolated values');
    });

    test('should translate action buttons', () => {
        const configureNow = I18n.t('actions.configureNow');
        const showInExplorer = I18n.t('actions.showInExplorer');
        const cancel = I18n.t('actions.cancel');
        
        assert.ok(configureNow, 'Action button should be translated');
        assert.ok(showInExplorer, 'Action button should be translated');
        assert.ok(cancel, 'Action button should be translated');
    });

    test('should translate settings labels', () => {
        const voiceName = I18n.t('settings.voiceName');
        const voiceGender = I18n.t('settings.voiceGender');
        const region = I18n.t('settings.region');
        
        assert.ok(voiceName, 'Settings label should be translated');
        assert.ok(voiceGender, 'Settings label should be translated');
        assert.ok(region, 'Settings label should be translated');
    });

    test('should handle complex interpolation scenarios', () => {
        // Test with multiple placeholders
        const message = I18n.t('progress.processingChunk', '1', '5');
        assert.ok(message.includes('1'), 'Should replace first placeholder');
        assert.ok(message.includes('5'), 'Should replace second placeholder');
        
        // Test with special characters in arguments
        const specialChars = I18n.t('notifications.success.speechGenerated', 'file with spaces & symbols.mp3');
        assert.ok(specialChars.includes('file with spaces & symbols.mp3'), 'Should handle special characters in interpolation');
    });

    test('should maintain translation consistency', () => {
        // Call same translation multiple times to ensure consistency
        const message1 = I18n.t('messages.extensionActivated');
        const message2 = I18n.t('messages.extensionActivated');
        const message3 = I18n.t('messages.extensionActivated');
        
        assert.strictEqual(message1, message2, 'Same translation should be consistent');
        assert.strictEqual(message2, message3, 'Same translation should be consistent');
        assert.strictEqual(message1, message3, 'Same translation should be consistent');
    });
});
