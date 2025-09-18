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
            chunks.length > 1 ? i : undefined,
            chunks.length
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
      
      // Try multiple possible paths for voice-list.json
      const possiblePaths = [
        // Development environment (running from src)
        path.join(__dirname, '../../voice-list.json'),
        // Production environment (webpack bundled in dist)
        path.join(__dirname, '../voice-list.json'),
        // VS Code extension context
        path.join(__dirname, 'voice-list.json'),
        // Fallback: try to find it relative to the workspace
        path.join(process.cwd(), 'voice-list.json')
      ];
      
      for (const voiceListPath of possiblePaths) {
        if (fs.existsSync(voiceListPath)) {
          console.log(`Loading voice list from: ${voiceListPath}`);
          const data = fs.readFileSync(voiceListPath, 'utf-8');
          return JSON.parse(data) as VoiceListItem[];
        }
      }
      
      console.error('Voice list file not found in any of the expected locations:', possiblePaths);
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
   * Configure voice settings with step-by-step selection
   */
  public static async configureVoiceSettings(): Promise<void> {
    const voiceList = this.getVoiceList();
    
    if (voiceList.length === 0) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
      return;
    }

    try {
      // Step 1: Select Locale (Language)
      const selectedLocale = await this.selectLocale(voiceList);
      if (!selectedLocale) return;

      // Step 2: Select Voice (with gender indication)
      const selectedVoice = await this.selectVoiceByLocale(voiceList, selectedLocale);
      if (!selectedVoice) return;

      // Step 3: Select Style (if available)
      const selectedStyle = await this.selectVoiceStyle(selectedVoice);
      if (!selectedStyle) return;

      // Update configuration
      await ConfigManager.updateWorkspaceConfig('voiceName', selectedVoice.ShortName);
      await ConfigManager.updateWorkspaceConfig('voiceGender', selectedVoice.Gender);
      await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);

      vscode.window.showInformationMessage(
        I18n.t('notifications.success.voiceSettingsUpdated') + 
        ` ${selectedVoice.DisplayName} (${selectedVoice.Gender}, ${selectedStyle})`
      );
    } catch (error) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceConfigurationFailed'));
      console.error('Voice configuration failed:', error);
    }
  }

  /**
   * Step 1: Select language/locale
   */
  private static async selectLocale(voiceList: VoiceListItem[]): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const currentVoice = voiceList.find(v => v.ShortName === currentSettings.name);
    const currentLocaleName = currentVoice?.LocaleName;
    
    const uniqueLocales = this.getUniqueValues(voiceList, 'LocaleName');
    const localeItems = uniqueLocales.map(localeName => {
      const voice = voiceList.find(v => v.LocaleName === localeName);
      return {
        label: localeName,
        description: voice?.Locale || '',
        detail: `${voiceList.filter(v => v.LocaleName === localeName).length} voices available`
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    // Move current locale to top and mark with ★
    if (currentLocaleName) {
      const currentIndex = localeItems.findIndex(item => item.label === currentLocaleName);
      if (currentIndex !== -1) {
        const [currentItem] = localeItems.splice(currentIndex, 1);
        if (currentItem) {
          currentItem.label = `★ ${currentItem.label}`;
          localeItems.unshift(currentItem);
        }
      }
    }

    const selectedLocale = await vscode.window.showQuickPick(localeItems, {
      placeHolder: I18n.t('config.prompts.selectLanguage'),
      title: 'Step 1/3: Select Language'
    });

    // Remove ★ symbol if present
    const selectedLocaleName = selectedLocale?.label.startsWith('★ ') ? 
      selectedLocale.label.substring(2) : 
      selectedLocale?.label;

    return selectedLocaleName;
  }

  /**
   * Step 2: Select voice with gender indication
   */
  private static async selectVoiceByLocale(voiceList: VoiceListItem[], localeName: string): Promise<VoiceListItem | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const voicesForLocale = voiceList.filter(v => v.LocaleName === localeName);
    
    const voiceItems = voicesForLocale.map(voice => ({
      label: `${voice.DisplayName} ${voice.LocalName ? `(${voice.LocalName})` : ''} - ${voice.Gender}`,
      description: voice.ShortName,
      detail: voice.StyleList && voice.StyleList.length > 0 
        ? `Styles: ${voice.StyleList.join(', ')}` 
        : 'Default style only',
      voice: voice
    })).sort((a, b) => {
      // Sort by gender first, then by name
      if (a.voice.Gender !== b.voice.Gender) {
        return a.voice.Gender.localeCompare(b.voice.Gender);
      }
      return a.voice.DisplayName.localeCompare(b.voice.DisplayName);
    });

    // Move current voice to top and mark with ★
    const currentIndex = voiceItems.findIndex(item => item.voice.ShortName === currentSettings.name);
    if (currentIndex !== -1) {
      const [currentItem] = voiceItems.splice(currentIndex, 1);
      if (currentItem) {
        currentItem.label = `★ ${currentItem.label}`;
        voiceItems.unshift(currentItem);
      }
    }

    const selectedVoiceItem = await vscode.window.showQuickPick(voiceItems, {
      placeHolder: I18n.t('config.prompts.selectVoice'),
      title: `Step 2/3: Select Voice for ${localeName}`
    });

    return selectedVoiceItem?.voice;
  }

  /**
   * Step 3: Select voice style
   */
  private static async selectVoiceStyle(voice: VoiceListItem): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const availableStyles = voice.StyleList || ['general'];
    
    if (availableStyles.length === 1) {
      // Only one style available, use it directly
      return availableStyles[0];
    }

    // Multiple styles available, let user choose
    const styleItems = availableStyles.map(style => ({
      label: style,
      description: this.getStyleDescription(style)
    }));

    // Move current style to top and mark with ★
    const currentIndex = styleItems.findIndex(item => item.label === currentSettings.style);
    if (currentIndex !== -1) {
      const [currentItem] = styleItems.splice(currentIndex, 1);
      if (currentItem) {
        currentItem.label = `★ ${currentItem.label}`;
        styleItems.unshift(currentItem);
      }
    }

    const selectedStyleItem = await vscode.window.showQuickPick(styleItems, {
      placeHolder: `Select style for ${voice.DisplayName}`,
      title: `Step 3/3: Select Voice Style`
    });

    // Remove ★ symbol if present
    const selectedStyle = selectedStyleItem?.label.startsWith('★ ') ? 
      selectedStyleItem.label.substring(2) : 
      selectedStyleItem?.label;

    return selectedStyle || 'general';
  }

  /**
   * Get friendly description for voice styles
   */
  private static getStyleDescription(style: string): string {
    const styleDescriptions: { [key: string]: string } = {
      'general': 'Default neutral style',
      'cheerful': 'Happy and upbeat',
      'sad': 'Melancholy and sorrowful', 
      'angry': 'Annoyed and angry',
      'fearful': 'Scared and nervous',
      'disgruntled': 'Contemptuous and complaining',
      'serious': 'Serious and commanding',
      'affectionate': 'Warm and affectionate',
      'gentle': 'Mild, polite and pleasant',
      'calm': 'Cool, collected and composed',
      'newscast': 'Formal and professional news style',
      'customerservice': 'Friendly customer service style',
      'assistant': 'Digital assistant style',
      'chat': 'Casual conversational style',
      'hopeful': 'Optimistic and inspiring',
      'excited': 'Energetic and enthusiastic'
    };
    
    return styleDescriptions[style] || 'Voice style';
  }

  /**
   * Quick select voice style for current voice
   */
  public static async selectVoiceStyleQuickly(): Promise<void> {
    const voiceSettings = ConfigManager.getVoiceSettings();
    const voiceList = this.getVoiceList();
    
    // Find current voice
    const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);
    
    if (!currentVoice) {
      vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
      return;
    }
    
    // Check if voice has styles
    if (!currentVoice.StyleList || currentVoice.StyleList.length === 0) {
      vscode.window.showInformationMessage(
        I18n.t('errors.voiceNoStyles', currentVoice.DisplayName)
      );
      return;
    }
    
    // Create style options with current selection at top
    const styleItems = currentVoice.StyleList.map(style => ({
      label: style,
      description: ''
    }));
    
    // Move current style to top and mark with ★
    const currentStyleIndex = styleItems.findIndex(item => item.label === voiceSettings.style);
    if (currentStyleIndex !== -1) {
      const [currentStyleItem] = styleItems.splice(currentStyleIndex, 1);
      if (currentStyleItem) {
        currentStyleItem.label = `★ ${currentStyleItem.label}`;
        styleItems.unshift(currentStyleItem);
      }
    }
    
    const selectedStyleItem = await vscode.window.showQuickPick(styleItems, {
      placeHolder: I18n.t('config.prompts.selectStyle'),
      title: `Select style for ${currentVoice.DisplayName}`
    });
    
    if (!selectedStyleItem) return;
    
    // Remove ★ symbol if present
    const selectedStyle = selectedStyleItem.label.startsWith('★ ') ? 
      selectedStyleItem.label.substring(2) : 
      selectedStyleItem.label;
    
    // Update configuration
    await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);
    
    vscode.window.showInformationMessage(
      I18n.t('notifications.success.voiceStyleChanged', selectedStyle)
    );
  }

  /**
   * Select voice role for roleplay-enabled voices
   */
  public static async selectVoiceRole(): Promise<void> {
    try {
      const voiceList = await this.getVoiceList();
      if (!voiceList || voiceList.length === 0) {
        vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
        return;
      }

      // Get current voice settings
      const voiceSettings = await ConfigManager.getVoiceSettings();
      if (!voiceSettings) {
        vscode.window.showErrorMessage(I18n.t('errors.failedToLoadVoiceSettings'));
        return;
      }

      // Find current voice
      const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);
      if (!currentVoice) {
        vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
        return;
      }

      // Check if voice has roleplay options
      if (!currentVoice.RolePlayList || currentVoice.RolePlayList.length === 0) {
        vscode.window.showInformationMessage(
          I18n.t('notifications.info.noRolesAvailable', currentVoice.DisplayName)
        );
        return;
      }

      // Create role selection items with current role marked
      const currentRole = voiceSettings.role || 'default';
      const roleItems = currentVoice.RolePlayList.map(role => ({
        label: currentRole === role ? `★ ${role}` : role,
        description: currentRole === role ? I18n.t('settings.current') : '',
        role: role
      }));

      // Show role selection
      const selectedItem = await vscode.window.showQuickPick(roleItems, {
        placeHolder: I18n.t('config.prompts.selectRole'),
        canPickMany: false
      });

      if (!selectedItem) {
        return; // User cancelled
      }

      // Update configuration
      await ConfigManager.updateWorkspaceConfig('voiceRole', selectedItem.role);

      vscode.window.showInformationMessage(
        I18n.t('notifications.success.voiceRoleChanged', selectedItem.role)
      );
    } catch (error) {
      console.error('Failed to select voice role:', error);
      vscode.window.showErrorMessage(I18n.t('errors.failedToSelectRole'));
    }
  }

  /**
   * Delay utility
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
