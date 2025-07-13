import * as vscode from 'vscode';
import { ProcessingResult, VoiceListItem } from '../types';
import { ConfigManager } from '../utils/config';
import { AzureSpeechService } from '../utils/azure';
import { AudioUtils } from '../utils/audio';
import { I18n } from '../i18n';

/**
 * Main speech synthesis service
 */
export class SpeechService {
  private static readonly MAX_CHUNK_SIZE = 8000;
  private static readonly PROCESSING_DELAY = 500; // Delay between chunks

  /**
   * Convert selected text to speech
   */
  public static async convertTextToSpeech(text: string, sourceFilePath: string): Promise<ProcessingResult> {
    try {
      // Validate configuration
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      // Get configuration
      const azureConfig = ConfigManager.getAzureConfigForTesting();
      const voiceSettings = ConfigManager.getVoiceSettings();

      // Extract text from markdown if needed
      const cleanText = AzureSpeechService.extractTextFromMarkdown(text);
      
      if (!cleanText.trim()) {
        throw new Error(I18n.t('errors.noTextContent'));
      }

      // Split text into chunks
      const chunks = AzureSpeechService.splitTextIntoChunks(cleanText, this.MAX_CHUNK_SIZE);
      
      // Process chunks
      const result = await this.processTextChunks(chunks, sourceFilePath, voiceSettings, azureConfig);
      
      return result;
    } catch (error) {
      console.error('Speech conversion failed:', error);
      throw error;
    }
  }

  /**
   * Process text chunks into audio files
   */
  private static async processTextChunks(
    chunks: string[],
    sourceFilePath: string,
    voiceSettings: any,
    azureConfig: any
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: false,
      processedChunks: 0,
      totalChunks: chunks.length,
      outputPaths: [],
      errors: []
    };

    // Show progress
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: I18n.t('progress.convertingToSpeech'),
      cancellable: false
    };

    await vscode.window.withProgress(progressOptions, async (progress) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        
        // Update progress
        const percentage = (i / chunks.length) * 100;
        progress.report({
          message: I18n.t('progress.processingChunk', (i + 1).toString(), chunks.length.toString()),
          increment: percentage
        });

        try {
          const outputPath = AudioUtils.generateOutputPath(
            sourceFilePath,
            chunk,
            chunks.length > 1 ? i : undefined
          );

          // Synthesize speech
          const audioBuffer = await AzureSpeechService.synthesizeSpeech(
            chunk,
            voiceSettings,
            azureConfig
          );

          // Save audio file
          await AudioUtils.saveAudioFile(audioBuffer, outputPath);

          result.outputPaths.push(outputPath);
          result.processedChunks++;

          // Add delay between chunks to avoid rate limiting
          if (i < chunks.length - 1) {
            await this.delay(this.PROCESSING_DELAY);
          }
        } catch (error) {
          const errorMessage = `Chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMessage);
          console.error(`Failed to process chunk ${i + 1}:`, error);
        }
      }
    });

    result.success = result.processedChunks > 0;
    return result;
  }

  /**
   * Get voice list from configuration
   */
  public static getVoiceList(): VoiceListItem[] {
    try {
      const fs = require('fs');
      const path = require('path');
      const voiceListPath = path.join(__dirname, '../../voice-list.json');
      
      if (fs.existsSync(voiceListPath)) {
        const data = fs.readFileSync(voiceListPath, 'utf-8');
        return JSON.parse(data) as VoiceListItem[];
      }
    } catch (error) {
      console.error('Failed to load voice list:', error);
    }
    
    return [];
  }

  /**
   * Filter voice list by attribute
   */
  public static filterVoiceList(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    value?: string
  ): VoiceListItem[] {
    if (!value) {
      return voiceList;
    }
    
    return voiceList.filter(item => item[attribute] === value);
  }

  /**
   * Get unique values for voice attribute
   */
  public static getUniqueValues(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem
  ): string[] {
    const values = voiceList.map(item => item[attribute]).filter((value): value is string => Boolean(value));
    return [...new Set(values)];
  }

  /**
   * Create quick pick items for voice selection
   */
  public static createVoiceQuickPickItems(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    defaultValue?: string
  ): vscode.QuickPickItem[] {
    const uniqueValues = this.getUniqueValues(voiceList, attribute);
    
    return uniqueValues.map(value => {
      const item: vscode.QuickPickItem = {
        label: value,
        picked: value === defaultValue
      };
      
      if (value === defaultValue) {
        item.description = I18n.t('settings.current');
      }
      
      return item;
    });
  }

  /**
   * Show configuration wizard
   */
  public static async showConfigurationWizard(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      I18n.t('messages.azureConfigurationRequired'),
      I18n.t('actions.configureAzure'),
      I18n.t('actions.configureVoice'),
      I18n.t('actions.cancel')
    );

    switch (result) {
      case I18n.t('actions.configureAzure'):
        await this.configureAzureSettings();
        break;
      case I18n.t('actions.configureVoice'):
        await this.configureVoiceSettings();
        break;
    }
  }

  /**
   * Configure Azure Speech Services settings
   */
  public static async configureAzureSettings(): Promise<void> {
    const subscriptionKey = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.subscriptionKey'),
      password: true,
      placeHolder: I18n.t('config.prompts.subscriptionKeyPlaceholder')
    });

    if (subscriptionKey) {
      await ConfigManager.updateWorkspaceConfig('azureSpeechServicesKey', subscriptionKey);
    }

    const region = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.region'),
      value: 'eastus',
      placeHolder: I18n.t('config.prompts.regionPlaceholder')
    });

    if (region) {
      await ConfigManager.updateWorkspaceConfig('speechServicesRegion', region);
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  /**
   * Configure voice settings
   */
  public static async configureVoiceSettings(): Promise<void> {
    const voiceList = this.getVoiceList();
    
    if (voiceList.length === 0) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
      return;
    }

    const currentSettings = ConfigManager.getVoiceSettings();

    // Voice name selection
    const voiceItems = this.createVoiceQuickPickItems(voiceList, 'name', currentSettings.name);
    const selectedVoice = await vscode.window.showQuickPick(voiceItems, {
      placeHolder: I18n.t('config.prompts.selectVoice')
    });

    if (selectedVoice) {
      await ConfigManager.updateWorkspaceConfig('voiceName', selectedVoice.label);
      
      // Update other settings based on selected voice
      const voice = voiceList.find(v => v.name === selectedVoice.label);
      if (voice) {
        await ConfigManager.updateWorkspaceConfig('voiceGender', voice.gender);
        await ConfigManager.updateWorkspaceConfig('voiceStyle', voice.style);
      }
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.voiceSettingsUpdated'));
  }

  /**
   * Delay utility
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
