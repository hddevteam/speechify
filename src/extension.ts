import * as vscode from 'vscode';
import { SpeechService } from './services/speechService';
import { ConfigManager } from './utils/config';
import { I18n } from './i18n';

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log(I18n.t('messages.extensionActivated'));

    // Register commands
    const commands = [
        vscode.commands.registerCommand('extension.speechify', convertTextToSpeech),
        vscode.commands.registerCommand('extension.showSpeechifyVoiceSettings', showVoiceSettings),
        vscode.commands.registerCommand('extension.configureSpeechifyVoiceSettings', configureSpeechifyVoiceSettings),
        vscode.commands.registerCommand('extension.configureSpeechifyAzureSettings', configureSpeechifyAzureSettings),
        vscode.commands.registerCommand('extension.selectSpeechifyVoiceStyle', selectVoiceStyle),
        vscode.commands.registerCommand('extension.selectSpeechifyVoiceRole', selectVoiceRole)
    ];

    // Add commands to subscriptions
    context.subscriptions.push(...commands);

    // Check initial configuration
    if (!ConfigManager.isConfigurationComplete()) {
        const result = await vscode.window.showInformationMessage(
            I18n.t('messages.configurationRequired'),
            I18n.t('actions.configureNow'),
            I18n.t('actions.later')
        );
        
        if (result === I18n.t('actions.configureNow')) {
            await SpeechService.showConfigurationWizard();
        }
    }
}

/**
 * Extension deactivation function
 */
export function deactivate(): void {
    console.log(I18n.t('messages.extensionDeactivated'));
}

/**
 * Convert selected text to speech
 */
async function convertTextToSpeech(): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(I18n.t('errors.noActiveEditor'));
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText.trim()) {
            vscode.window.showErrorMessage(I18n.t('errors.noTextSelected'));
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
                ? I18n.t('notifications.success.speechGenerated', result.outputPaths[0] || '')
                : I18n.t('notifications.success.speechGeneratedMultiple', result.processedChunks.toString());
            
            const action = await vscode.window.showInformationMessage(
                message,
                I18n.t('actions.showInExplorer'),
                I18n.t('actions.openFile')
            );
            
            if (action === I18n.t('actions.showInExplorer') && result.outputPaths.length > 0) {
                const filePath = result.outputPaths[0];
                if (filePath) {
                    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
                }
            } else if (action === I18n.t('actions.openFile') && result.outputPaths.length > 0) {
                const filePath = result.outputPaths[0];
                if (filePath) {
                    await vscode.env.openExternal(vscode.Uri.file(filePath));
                }
            }
        } else {
            const errorMessage = result.errors.length > 0 
                ? I18n.t('errors.speechGenerationFailed', result.errors.join(', '))
                : I18n.t('errors.speechGenerationFailed', 'Unknown error');
            
            vscode.window.showErrorMessage(errorMessage);
        }
    } catch (error) {
        console.error('Text to speech conversion failed:', error);
        vscode.window.showErrorMessage(
            I18n.t('errors.speechGenerationFailed', error instanceof Error ? error.message : 'Unknown error')
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
            `${I18n.t('settings.voiceName')}: ${voiceSettings.name}`,
            `${I18n.t('settings.voiceGender')}: ${voiceSettings.gender}`,
            `${I18n.t('settings.voiceStyle')}: ${voiceSettings.style}`,
            `${I18n.t('settings.region')}: ${config.speechServicesRegion}`,
            `${I18n.t('settings.hasApiKey')}: ${config.azureSpeechServicesKey ? I18n.t('settings.yes') : I18n.t('settings.no')}`
        ].join('\\n');
        
        const action = await vscode.window.showInformationMessage(
            I18n.t('messages.currentSettings', settingsInfo),
            I18n.t('actions.configureVoice'),
            I18n.t('actions.configureAzure')
        );
        
        if (action === I18n.t('actions.configureVoice')) {
            await configureSpeechifyVoiceSettings();
        } else if (action === I18n.t('actions.configureAzure')) {
            await configureSpeechifyAzureSettings();
        }
    } catch (error) {
        console.error('Failed to show voice settings:', error);
        vscode.window.showErrorMessage(I18n.t('errors.failedToLoadVoiceSettings'));
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
        vscode.window.showErrorMessage(I18n.t('errors.failedToConfigureVoice'));
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
        vscode.window.showErrorMessage(I18n.t('errors.failedToConfigureAzure'));
    }
}

/**
 * Quick select voice style for current voice
 */
async function selectVoiceStyle(): Promise<void> {
    try {
        await SpeechService.selectVoiceStyleQuickly();
    } catch (error) {
        console.error('Failed to select voice style:', error);
        vscode.window.showErrorMessage(I18n.t('errors.failedToSelectStyle'));
    }
}

/**
 * Select voice role for roleplay voices
 */
async function selectVoiceRole(): Promise<void> {
    try {
        await SpeechService.selectVoiceRole();
    } catch (error) {
        console.error('Failed to select voice role:', error);
        vscode.window.showErrorMessage(I18n.t('errors.failedToSelectRole'));
    }
}
