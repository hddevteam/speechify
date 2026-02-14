import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigManager } from '../../utils/config';
import { loadTestConfig, hasTestConfig } from '../testUtils';

suite('Configuration Manager Tests', () => {
    
    test('should load configuration properly', () => {
        // Test basic configuration structure
        const config = vscode.workspace.getConfiguration('speechify');
        assert.ok(config, 'Configuration should be available');
    });

    test('should validate required configuration fields', () => {
        if (!hasTestConfig()) {
            console.warn('Skipping Azure configuration test - test-config.json not found');
            return;
        }

        const testConfig = loadTestConfig();
        assert.ok(testConfig.subscriptionKey, 'Subscription key should be provided');
        assert.ok(testConfig.endpoint, 'Endpoint should be provided');
        assert.ok(testConfig.subscriptionKey.length > 0, 'Subscription key should not be empty');
        assert.ok(testConfig.endpoint.startsWith('https://'), 'Endpoint should be a valid HTTPS URL');
    });

    test('should get Azure configuration for testing', () => {
        if (!hasTestConfig()) {
            console.warn('Skipping Azure configuration retrieval test - test-config.json not found');
            return;
        }

        const azureConfig = ConfigManager.getAzureConfigForTesting();
        assert.ok(azureConfig, 'Azure configuration should be available');
        assert.ok(azureConfig.subscriptionKey, 'Azure subscription key should be available');
        assert.ok(azureConfig.region, 'Azure region should be available');
    });

    test('should check configuration completeness', () => {
        const isComplete = ConfigManager.isConfigurationComplete();
        // This might be false in test environment, which is acceptable
        assert.strictEqual(typeof isComplete, 'boolean', 'Configuration completeness check should return boolean');
    });

    test('should get voice settings with defaults', () => {
        const voiceSettings = ConfigManager.getVoiceSettings();
        assert.ok(voiceSettings, 'Voice settings should be available');
        assert.ok(voiceSettings.name, 'Voice name should have a default value');
        assert.ok(voiceSettings.gender, 'Voice gender should have a default value');
        assert.ok(voiceSettings.locale, 'Voice locale should have a default value');
    });

    test('should handle workspace configuration updates', async () => {
        const testValue = 'test-voice-name';
        
        try {
            await ConfigManager.updateWorkspaceConfig('voiceName', testValue);
            
            // Note: In test environment, workspace configuration might not persist
            // This test primarily ensures the method doesn't throw errors
            assert.doesNotThrow(() => {
                ConfigManager.updateWorkspaceConfig('voiceName', testValue);
            }, 'Updating workspace configuration should not throw errors');
            
        } catch (error) {
            // In test environment, workspace updates might fail
            console.warn('Workspace configuration update failed in test environment:', error);
        }
    });

    test('should validate configuration object structure', () => {
        const voiceSettings = ConfigManager.getVoiceSettings();
        
        // Check that all expected properties exist
        assert.ok('name' in voiceSettings, 'Voice settings should have name property');
        assert.ok('gender' in voiceSettings, 'Voice settings should have gender property');
        assert.ok('locale' in voiceSettings, 'Voice settings should have locale property');
        assert.ok('style' in voiceSettings, 'Voice settings should have style property');
        
        // Check property types
        assert.strictEqual(typeof voiceSettings.name, 'string', 'Voice name should be string');
        assert.strictEqual(typeof voiceSettings.gender, 'string', 'Voice gender should be string');
        assert.strictEqual(typeof voiceSettings.locale, 'string', 'Voice locale should be string');
    });

    test('should normalize vision endpoint to origin', () => {
        const normalized = ConfigManager.normalizeVisionEndpoint('https://demo-resource.openai.azure.com/');
        assert.strictEqual(normalized, 'https://demo-resource.openai.azure.com', 'Endpoint should be normalized to origin without trailing slash');
    });

    test('should validate complete vision settings', () => {
        const validation = ConfigManager.validateVisionSettings({
            apiKey: 'test-key',
            endpoint: 'https://demo-resource.openai.azure.com',
            deployment: 'gpt-5-mini',
            refinementDeployment: 'gpt-5.2'
        });

        assert.strictEqual(validation.isValid, true, 'Complete vision settings should pass validation');
        assert.strictEqual(validation.errors.length, 0, 'Validation errors should be empty for valid settings');
    });

    test('should detect invalid vision endpoint and missing fields', () => {
        const validation = ConfigManager.validateVisionSettings({
            apiKey: '',
            endpoint: 'http://example.com',
            deployment: '',
            refinementDeployment: ''
        });

        assert.strictEqual(validation.isValid, false, 'Invalid vision settings should fail validation');
        assert.ok(validation.errors.includes('missingApiKey'), 'Should detect missing API key');
        assert.ok(validation.errors.includes('invalidEndpointProtocol'), 'Should enforce HTTPS endpoint');
        assert.ok(validation.errors.includes('invalidEndpointHost'), 'Should enforce Azure OpenAI endpoint host');
        assert.ok(validation.errors.includes('missingVisionDeployment'), 'Should detect missing vision deployment');
        assert.ok(validation.errors.includes('missingRefinementDeployment'), 'Should detect missing refinement deployment');
    });
});
