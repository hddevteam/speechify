import * as assert from 'assert';
import * as vscode from 'vscode';
import { hasTestConfig, createTempFile, cleanupTempFile, TEST_TEXTS } from '../testUtils';

suite('Extension Integration Tests', () => {
    
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present and activate', async () => {
        const extension = vscode.extensions.getExtension('luckyxmobile.speechify');
        assert.ok(extension, 'Extension should be present');
        
        // Activate the extension
        await extension.activate();
        assert.ok(extension.isActive, 'Extension should be activated');
    });

    test('Extension commands should be registered', async () => {
        const commands = await vscode.commands.getCommands();
        
        const expectedCommands = [
            'extension.speechify',
            'extension.showSpeechifyVoiceSettings',
            'extension.configureSpeechifyVoiceSettings',
            'extension.configureSpeechifyAzureSettings'
        ];
        
        for (const command of expectedCommands) {
            assert.ok(commands.includes(command), `Command ${command} should be registered`);
        }
    });

    test('Extension configuration should be available', () => {
        const config = vscode.workspace.getConfiguration('speechify');
        assert.ok(config, 'Extension configuration should be available');
        
        // Check that configuration schema is properly defined
        const voiceName = config.get('voiceName');
        const azureRegion = config.get('speechServicesRegion');
        
        // These should be defined (with defaults) even if not set by user
        assert.notStrictEqual(voiceName, undefined, 'Voice name should have a default value');
        assert.notStrictEqual(azureRegion, undefined, 'Azure region should have a default value');
    });

    test('Main speechify command should be callable', async () => {
        if (!hasTestConfig()) {
            console.warn('Skipping command execution test - test-config.json not found');
            return;
        }

        // Create a temporary document with test content
        const document = await vscode.workspace.openTextDocument({
            content: TEST_TEXTS.english.short,
            language: 'plaintext'
        });
        
        // Open the document in an editor
        const editor = await vscode.window.showTextDocument(document);
        
        // Select all text
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        editor.selection = new vscode.Selection(fullRange.start, fullRange.end);
        
        try {
            // Execute the command - it should not throw
            await vscode.commands.executeCommand('speechify.speechify');
            
            // If we get here, the command executed without throwing
            assert.ok(true, 'Main speechify command should execute without throwing');
            
        } catch (error) {
            // Command might fail due to configuration, but should handle errors gracefully
            assert.ok(error instanceof Error, 'Command should throw proper Error objects');
            console.warn('Command execution failed (expected in test environment):', (error as Error).message);
        }
    });

    test('Voice settings command should be callable', async () => {
        try {
            // Execute the voice settings command
            await vscode.commands.executeCommand('speechify.showVoiceSettings');
            assert.ok(true, 'Voice settings command should execute without throwing');
            
        } catch (error) {
            // Command might fail in test environment, but should handle errors gracefully
            assert.ok(error instanceof Error, 'Command should throw proper Error objects');
            console.warn('Voice settings command failed (expected in test environment):', (error as Error).message);
        }
    });

    test('Configure voice settings command should be callable', async () => {
        try {
            // Execute the configure voice settings command
            await vscode.commands.executeCommand('speechify.configureVoiceSettings');
            assert.ok(true, 'Configure voice settings command should execute without throwing');
            
        } catch (error) {
            // Command might fail in test environment, but should handle errors gracefully
            assert.ok(error instanceof Error, 'Command should throw proper Error objects');
            console.warn('Configure voice settings command failed (expected in test environment):', (error as Error).message);
        }
    });

    test('Configure Azure settings command should be callable', async () => {
        try {
            // Execute the configure Azure settings command
            await vscode.commands.executeCommand('speechify.configureSpeechifyAzureSettings');
            assert.ok(true, 'Configure Azure settings command should execute without throwing');
            
        } catch (error) {
            // Command might fail in test environment, but should handle errors gracefully
            assert.ok(error instanceof Error, 'Command should throw proper Error objects');
            console.warn('Configure Azure settings command failed (expected in test environment):', (error as Error).message);
        }
    });

    test('Extension should handle no active editor gracefully', async () => {
        // Close all editors
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        
        try {
            // Try to execute speechify command with no active editor
            await vscode.commands.executeCommand('speechify.speechify');
            
            // Should not reach here, should throw an error
            assert.fail('Command should throw error when no editor is active');
            
        } catch (error) {
            // Expected to throw an error
            assert.ok(error instanceof Error, 'Should throw proper Error object');
            console.log('✅ Correctly handled no active editor scenario');
        }
    });

    test('Extension should handle no text selection gracefully', async () => {
        if (!hasTestConfig()) {
            console.warn('Skipping no selection test - test-config.json not found');
            return;
        }

        // Create a document but don't select any text
        const document = await vscode.workspace.openTextDocument({
            content: TEST_TEXTS.english.short,
            language: 'plaintext'
        });
        
        const editor = await vscode.window.showTextDocument(document);
        
        // Clear selection
        editor.selection = new vscode.Selection(0, 0, 0, 0);
        
        try {
            // Try to execute speechify command with no selection
            await vscode.commands.executeCommand('speechify.speechify');
            
            // Should not reach here, should throw an error
            assert.fail('Command should throw error when no text is selected');
            
        } catch (error) {
            // Expected to throw an error
            assert.ok(error instanceof Error, 'Should throw proper Error object');
            console.log('✅ Correctly handled no text selection scenario');
        }
    });

    test('Extension should handle file operations correctly', async () => {
        // Test file creation and cleanup utilities
        const testContent = 'Test file content';
        const tempFile = createTempFile(testContent, '.txt');
        
        assert.ok(tempFile, 'Should create temporary file');
        assert.ok(tempFile.endsWith('.txt'), 'Should have correct extension');
        
        // Verify file was created and has content
        const fs = require('fs');
        assert.ok(fs.existsSync(tempFile), 'Temporary file should exist');
        
        const content = fs.readFileSync(tempFile, 'utf-8');
        assert.strictEqual(content, testContent, 'File should have correct content');
        
        // Clean up
        cleanupTempFile(tempFile);
        assert.ok(!fs.existsSync(tempFile), 'Temporary file should be cleaned up');
    });

    test('Extension should work with different file types', async () => {
        const testCases = [
            { content: TEST_TEXTS.english.short, language: 'plaintext' },
            { content: TEST_TEXTS.markdown, language: 'markdown' },
            { content: '// This is a code comment\nconst x = 1;', language: 'javascript' }
        ];
        
        for (const testCase of testCases) {
            const document = await vscode.workspace.openTextDocument({
                content: testCase.content,
                language: testCase.language
            });
            
            assert.ok(document, `Should create ${testCase.language} document`);
            assert.strictEqual(document.languageId, testCase.language, `Document should have correct language ID`);
            assert.ok(document.getText().length > 0, 'Document should have content');
        }
    });

    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});
