import * as vscode from 'vscode';
import { SpeechService } from './services/speechService';
import { ConfigManager } from './utils/config';

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Speechify extension is now active!');

    // Register commands
    const commands = [
        vscode.commands.registerCommand('extension.speechify', convertTextToSpeech),
        vscode.commands.registerCommand('extension.showSpeechifyVoiceSettings', showVoiceSettings),
        vscode.commands.registerCommand('extension.configureSpeechifyVoiceSettings', configureSpeechifyVoiceSettings),
        vscode.commands.registerCommand('extension.configureSpeechifyAzureSettings', configureSpeechifyAzureSettings)
    ];

    // Add commands to subscriptions
    context.subscriptions.push(...commands);

    // Check initial configuration
    if (!ConfigManager.isConfigurationComplete()) {
        const result = await vscode.window.showInformationMessage(
            'Speechify requires Azure Speech Services configuration to work properly.',
            'Configure Now',
            'Later'
        );
        
        if (result === 'Configure Now') {
            await SpeechService.showConfigurationWizard();
        }
    }
}

/**
 * Extension deactivation function
 */
export function deactivate(): void {
    console.log('Speechify extension is now deactivated!');
}

/**
 * Convert selected text to speech
 */
async function convertTextToSpeech(): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open a file first.');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText.trim()) {
            vscode.window.showErrorMessage('No text selected. Please select some text first.');
            return;
        }

        // Check configuration
        if (!ConfigManager.isConfigurationComplete()) {
            await SpeechService.showConfigurationWizard();
            return;
        }

        const sourceFilePath = editor.document.uri.fsPath;
        
        // Convert text to speech
        const result = await SpeechService.convertTextToSpeech(selectedText, sourceFilePath);
        
        if (result.success) {
            const message = result.processedChunks === 1 
                ? `Speech generated successfully! Audio saved to: ${result.outputPaths[0]}`
                : `Speech generated successfully! ${result.processedChunks} audio files created.`;
            
            const action = await vscode.window.showInformationMessage(
                message,
                'Show in Explorer',
                'Open File'
            );
            
            if (action === 'Show in Explorer' && result.outputPaths.length > 0) {
                const filePath = result.outputPaths[0];
                if (filePath) {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
                }
            } else if (action === 'Open File' && result.outputPaths.length > 0) {
                const filePath = result.outputPaths[0];
                if (filePath) {
                    await vscode.env.openExternal(vscode.Uri.file(filePath));
                }
            }
        } else {
            const errorMessage = result.errors.length > 0 
                ? `Failed to generate speech: ${result.errors.join(', ')}`
                : 'Failed to generate speech due to unknown error.';
            
            vscode.window.showErrorMessage(errorMessage);
        }
    } catch (error) {
        console.error('Text to speech conversion failed:', error);
        vscode.window.showErrorMessage(
            `Failed to convert text to speech: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * Show current voice settings
 */
async function showVoiceSettings(): Promise<void> {
    try {
        const config = ConfigManager.getWorkspaceConfig();
        const voiceSettings = ConfigManager.getVoiceSettings();
        
        const settingsInfo = [
            `Voice Name: ${voiceSettings.name}`,
            `Voice Gender: ${voiceSettings.gender}`,
            `Voice Style: ${voiceSettings.style}`,
            `Region: ${config.speechServicesRegion}`,
            `Has API Key: ${config.azureSpeechServicesKey ? 'Yes' : 'No'}`
        ].join('\\n');
        
        const action = await vscode.window.showInformationMessage(
            `Current Speechify Settings:\\n${settingsInfo}`,
            'Configure Voice',
            'Configure Azure'
        );
        
        if (action === 'Configure Voice') {
            await configureSpeechifyVoiceSettings();
        } else if (action === 'Configure Azure') {
            await configureSpeechifyAzureSettings();
        }
    } catch (error) {
        console.error('Failed to show voice settings:', error);
        vscode.window.showErrorMessage('Failed to load voice settings.');
    }
}

/**
 * Configure voice settings
 */
async function configureSpeechifyVoiceSettings(): Promise<void> {
    try {
        await SpeechService.configureVoiceSettings();
    } catch (error) {
        console.error('Failed to configure voice settings:', error);
        vscode.window.showErrorMessage('Failed to configure voice settings.');
    }
}

/**
 * Configure Azure Speech Services settings
 */
async function configureSpeechifyAzureSettings(): Promise<void> {
    try {
        await SpeechService.configureAzureSettings();
    } catch (error) {
        console.error('Failed to configure Azure settings:', error);
        vscode.window.showErrorMessage('Failed to configure Azure settings.');
    }
}
