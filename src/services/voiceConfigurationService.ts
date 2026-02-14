import * as vscode from 'vscode';
import { VoiceListItem } from '../types';
import { ConfigManager } from '../utils/config';
import { I18n } from '../i18n';
import { buildVisionConfigGuidance } from './visionGuidance';

export class VoiceConfigurationService {
  private static extensionContext: vscode.ExtensionContext | null = null;

  public static setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  public static getVoiceList(): VoiceListItem[] {
    try {
      const fs = require('fs');
      const path = require('path');

      const possiblePaths = [
        this.extensionContext ? path.join(this.extensionContext.extensionPath, 'voice-list.json') : null,
        path.join(__dirname, '../../voice-list.json'),
        path.join(__dirname, '../voice-list.json'),
        path.join(__dirname, 'voice-list.json')
      ].filter((p: string | null): p is string => p !== null);

      for (const voiceListPath of possiblePaths) {
        if (fs.existsSync(voiceListPath)) {
          const data = fs.readFileSync(voiceListPath, 'utf-8');
          return JSON.parse(data) as VoiceListItem[];
        }
      }
    } catch (error) {
      console.error('Failed to load voice list:', error);
    }

    return [];
  }

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

  public static getUniqueValues(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem
  ): string[] {
    const values = voiceList.map(item => item[attribute]).filter((value): value is string => Boolean(value));
    return [...new Set(values)];
  }

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

  public static async configureVisionSettings(): Promise<void> {
    const current = ConfigManager.getVisionConfig();

    const apiKey = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.visionApiKey'),
      password: true,
      value: current.apiKey || '',
      placeHolder: I18n.t('config.prompts.visionApiKeyPlaceholder')
    });

    if (apiKey === undefined) return;

    const endpointInput = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.visionEndpoint'),
      value: current.endpoint || 'https://<resource>.openai.azure.com',
      placeHolder: I18n.t('config.prompts.visionEndpointPlaceholder')
    });

    if (endpointInput === undefined) return;

    const visionDeployment = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.visionDeployment'),
      value: current.deployment || 'gpt-5-mini',
      placeHolder: I18n.t('config.prompts.visionDeploymentPlaceholder')
    });

    if (visionDeployment === undefined) return;

    const refinementDeployment = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.refinementDeployment'),
      value: current.refinementDeployment || 'gpt-5.2',
      placeHolder: I18n.t('config.prompts.refinementDeploymentPlaceholder')
    });

    if (refinementDeployment === undefined) return;

    const normalizedEndpoint = ConfigManager.normalizeVisionEndpoint(endpointInput);
    const validation = ConfigManager.validateVisionSettings({
      apiKey,
      endpoint: normalizedEndpoint,
      deployment: visionDeployment,
      refinementDeployment
    });

    if (!validation.isValid) {
      throw new Error(buildVisionConfigGuidance(validation, I18n.t));
    }

    await ConfigManager.updateWorkspaceConfig('visionApiKey', apiKey);
    await ConfigManager.updateWorkspaceConfig('visionEndpoint', normalizedEndpoint);
    await ConfigManager.updateWorkspaceConfig('visionDeployment', visionDeployment.trim());
    await ConfigManager.updateWorkspaceConfig('refinementDeployment', refinementDeployment.trim());

    vscode.window.showInformationMessage(I18n.t('notifications.success.visionSettingsUpdated'));
  }

  public static async configureVoiceSettings(): Promise<void> {
    const voiceList = this.getVoiceList();

    if (voiceList.length === 0) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
      return;
    }

    try {
      const selectedLocale = await this.selectLocale(voiceList);
      if (!selectedLocale) return;

      const selectedVoice = await this.selectVoiceByLocale(voiceList, selectedLocale);
      if (!selectedVoice) return;

      const selectedStyle = await this.selectVoiceStyle(selectedVoice);
      if (!selectedStyle) return;

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

  public static async selectVoiceStyleQuickly(): Promise<void> {
    const voiceSettings = ConfigManager.getVoiceSettings();
    const voiceList = this.getVoiceList();

    const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);

    if (!currentVoice) {
      vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
      return;
    }

    if (!currentVoice.StyleList || currentVoice.StyleList.length === 0) {
      vscode.window.showInformationMessage(I18n.t('errors.voiceNoStyles', currentVoice.DisplayName));
      return;
    }

    const styleItems = currentVoice.StyleList.map(style => ({ label: style, description: '' }));
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

    const selectedStyle = selectedStyleItem.label.startsWith('★ ')
      ? selectedStyleItem.label.substring(2)
      : selectedStyleItem.label;

    await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);

    vscode.window.showInformationMessage(I18n.t('notifications.success.voiceStyleChanged', selectedStyle));
  }

  public static async selectVoiceRole(): Promise<void> {
    try {
      const voiceList = this.getVoiceList();
      if (!voiceList || voiceList.length === 0) {
        vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
        return;
      }

      const voiceSettings = ConfigManager.getVoiceSettings();
      if (!voiceSettings) {
        vscode.window.showErrorMessage(I18n.t('errors.failedToLoadVoiceSettings'));
        return;
      }

      const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);
      if (!currentVoice) {
        vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
        return;
      }

      if (!currentVoice.RolePlayList || currentVoice.RolePlayList.length === 0) {
        vscode.window.showInformationMessage(I18n.t('notifications.info.noRolesAvailable', currentVoice.DisplayName));
        return;
      }

      const currentRole = voiceSettings.role || 'default';
      const roleItems = currentVoice.RolePlayList.map(role => ({
        label: currentRole === role ? `★ ${role}` : role,
        description: currentRole === role ? I18n.t('settings.current') : '',
        role
      }));

      const selectedItem = await vscode.window.showQuickPick(roleItems, {
        placeHolder: I18n.t('config.prompts.selectRole'),
        canPickMany: false
      });

      if (!selectedItem) return;

      await ConfigManager.updateWorkspaceConfig('voiceRole', selectedItem.role);

      vscode.window.showInformationMessage(I18n.t('notifications.success.voiceRoleChanged', selectedItem.role));
    } catch (error) {
      console.error('Failed to select voice role:', error);
      vscode.window.showErrorMessage(I18n.t('errors.failedToSelectRole'));
    }
  }

  private static async selectLocale(voiceList: VoiceListItem[]): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const currentVoice = voiceList.find(v => v.ShortName === currentSettings.name);
    const currentLocaleName = currentVoice?.LocaleName;

    const uniqueLocales = this.getUniqueValues(voiceList, 'LocaleName');
    const localeItems = uniqueLocales
      .map(localeName => {
        const voice = voiceList.find(v => v.LocaleName === localeName);
        return {
          label: localeName,
          description: voice?.Locale || '',
          detail: `${voiceList.filter(v => v.LocaleName === localeName).length} voices available`
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

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

    return selectedLocale?.label.startsWith('★ ')
      ? selectedLocale.label.substring(2)
      : selectedLocale?.label;
  }

  private static async selectVoiceByLocale(
    voiceList: VoiceListItem[],
    localeName: string
  ): Promise<VoiceListItem | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const voicesForLocale = voiceList.filter(v => v.LocaleName === localeName);

    const voiceItems = voicesForLocale
      .map(voice => ({
        label: `${voice.DisplayName} ${voice.LocalName ? `(${voice.LocalName})` : ''} - ${voice.Gender}`,
        description: voice.ShortName,
        detail:
          voice.StyleList && voice.StyleList.length > 0
            ? `Styles: ${voice.StyleList.join(', ')}`
            : 'Default style only',
        voice
      }))
      .sort((a, b) => {
        if (a.voice.Gender !== b.voice.Gender) {
          return a.voice.Gender.localeCompare(b.voice.Gender);
        }
        return a.voice.DisplayName.localeCompare(b.voice.DisplayName);
      });

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

  private static async selectVoiceStyle(voice: VoiceListItem): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const availableStyles = voice.StyleList || ['general'];

    if (availableStyles.length === 1) {
      return availableStyles[0];
    }

    const styleItems = availableStyles.map(style => ({
      label: style,
      description: this.getStyleDescription(style)
    }));

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
      title: 'Step 3/3: Select Voice Style'
    });

    const selectedStyle = selectedStyleItem?.label.startsWith('★ ')
      ? selectedStyleItem.label.substring(2)
      : selectedStyleItem?.label;

    return selectedStyle || 'general';
  }

  private static getStyleDescription(style: string): string {
    const styleDescriptions: { [key: string]: string } = {
      general: 'Default neutral style',
      cheerful: 'Happy and upbeat',
      sad: 'Melancholy and sorrowful',
      angry: 'Annoyed and angry',
      fearful: 'Scared and nervous',
      disgruntled: 'Contemptuous and complaining',
      serious: 'Serious and commanding',
      affectionate: 'Warm and affectionate',
      gentle: 'Mild, polite and pleasant',
      calm: 'Cool, collected and composed',
      newscast: 'Formal and professional news style',
      customerservice: 'Friendly customer service style',
      assistant: 'Digital assistant style',
      chat: 'Casual conversational style',
      hopeful: 'Optimistic and inspiring',
      excited: 'Energetic and enthusiastic'
    };

    return styleDescriptions[style] || 'Voice style';
  }
}
