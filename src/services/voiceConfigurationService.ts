import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SpeechProviderType, SpeechifyConfig, VoiceListItem } from '../types';
import { ConfigManager } from '../utils/config';
import { upsertSpeechifyWorkspaceSettingsJsonText } from '../utils/speechifySettings';
import { I18n } from '../i18n';
import { buildVisionConfigGuidance } from './visionGuidance';
import { CosyVoiceReferenceService } from './cosyVoiceReferenceService';
import {
  LocalReferenceWorkbenchFieldId,
  LocalReferenceWorkbenchPanel,
  LocalReferenceWorkbenchState
} from '../webview/localReferenceWorkbenchPanel';
import { ReferenceMediaService } from './referenceMediaService';

type LocalReferenceTarget = 'cosyvoice' | 'qwen3-tts' | 'both';

export class VoiceConfigurationService {
  private static extensionContext: vscode.ExtensionContext | null = null;

  public static setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  public static getVoiceList(): VoiceListItem[] {
    if (ConfigManager.getSpeechProvider() !== 'azure') {
      return [];
    }

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

  public static async showConfigurationWizard(providerOverride?: SpeechProviderType): Promise<void> {
    if (providerOverride === 'cosyvoice') {
      await this.configureCosyVoiceSettings();
      return;
    }

    if (providerOverride === 'qwen3-tts') {
      await this.configureQwenTtsSettings();
      return;
    }

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
    const currentProvider = ConfigManager.getSpeechProvider();
    const providerChoice = await vscode.window.showQuickPick(
      this.getSpeechProviderQuickPickItems(currentProvider),
      {
        title: this.getSpeechProviderPickerTitle(),
        placeHolder: this.getSpeechProviderPickerPlaceholder()
      }
    );

    if (!providerChoice) {
      return;
    }

    await ConfigManager.updateProjectConfig('speechProvider', providerChoice.provider);

    if (providerChoice.provider === 'cosyvoice') {
      await this.configureCosyVoiceSettings();
      return;
    }

    if (providerChoice.provider === 'qwen3-tts') {
      await this.configureQwenTtsSettings();
      return;
    }

    await this.configureAzureBackendSettings();
  }

  private static async configureAzureBackendSettings(): Promise<void> {
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

  public static async configureCosyVoiceSettings(): Promise<void> {
    let isFinished = false;

    while (!isFinished) {
      const current = ConfigManager.getCosyVoiceConfig();
      const action = await vscode.window.showQuickPick(
        [
          {
            label: I18n.t('actions.editBackendUrl'),
            description: current.baseUrl || 'http://127.0.0.1:50000'
          },
          {
            label: I18n.t('actions.openGitHubRepo'),
            description: 'https://github.com/FunAudioLLM/CosyVoice'
          },
          {
            label: I18n.t('actions.finish'),
            description: ''
          }
        ],
        {
          title: this.getCosyVoiceMenuTitle(),
          placeHolder: this.getCosyVoiceSelectActionPlaceholder()
        }
      );

      if (!action || action.label === I18n.t('actions.finish')) {
        isFinished = true;
        continue;
      }

      if (action.label === I18n.t('actions.editBackendUrl')) {
        await this.editCosyVoiceBackendUrl();
        continue;
      }

      if (action.label === I18n.t('actions.openGitHubRepo')) {
        await this.openGitHubRepo('https://github.com/FunAudioLLM/CosyVoice');
      }
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  public static async configureQwenTtsSettings(): Promise<void> {
    let isFinished = false;

    while (!isFinished) {
      const current = ConfigManager.getQwenTtsConfig();
      const action = await vscode.window.showQuickPick(
        [
          {
            label: this.getQwenTtsEditModelLabel(),
            description: current.model || 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16'
          },
          {
            label: this.getQwenTtsEditPythonPathLabel(),
            description: this.getQwenTtsPythonPathDescription()
          },
          {
            label: I18n.t('actions.openGitHubRepo'),
            description: 'https://github.com/Blaizzy/mlx-audio'
          },
          {
            label: I18n.t('actions.finish'),
            description: ''
          }
        ],
        {
          title: this.getQwenTtsMenuTitle(),
          placeHolder: this.getQwenTtsSelectActionPlaceholder()
        }
      );

      if (!action || action.label === I18n.t('actions.finish')) {
        isFinished = true;
        continue;
      }

      if (action.label === this.getQwenTtsEditModelLabel()) {
        await this.editQwenTtsModel();
        continue;
      }

      if (action.label === this.getQwenTtsEditPythonPathLabel()) {
        await this.editQwenTtsPythonPath();
        continue;
      }

      if (action.label === I18n.t('actions.openGitHubRepo')) {
        await this.openGitHubRepo('https://github.com/Blaizzy/mlx-audio');
      }
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  public static async openLocalReferenceWorkbench(): Promise<void> {
    if (!this.extensionContext) {
      throw new Error(this.getExtensionContextNotInitializedMessage());
    }

    await LocalReferenceWorkbenchPanel.open(this.extensionContext, {
      getState: async () => this.getLocalReferenceWorkbenchState(),
      selectMedia: async (pid) => this.selectReferenceAudioForTarget(pid),
      transcribe: async (pid) => this.autoTranscribeReferenceAudioForTarget(pid),
      saveRecording: async (pid, buf, text) => this.saveInlineRecording(pid, buf, text),
      saveReferenceText: async (pid, text) => this.saveReferenceTextForProvider(pid, text),
      saveField: async (fieldId, value) => this.saveLocalReferenceWorkbenchField(fieldId, value)
    });
  }

  public static async recordLocalReferenceAudio(): Promise<void> {
    await this.openLocalReferenceWorkbench();
  }

  public static async selectLocalReferenceAudio(targetOverride?: LocalReferenceTarget): Promise<void> {
    const target = targetOverride ?? await this.chooseLocalReferenceTarget({
      allowBoth: true,
      placeHolder: this.getLocalReferenceTargetPlaceholder('select')
    });

    if (!target) {
      return;
    }

    await this.selectReferenceAudioForTarget(target);
  }

  public static async autoTranscribeLocalReferenceAudio(targetOverride?: LocalReferenceTarget): Promise<void> {
    const target = targetOverride ?? await this.chooseLocalReferenceTarget({
      allowBoth: true,
      placeHolder: this.getLocalReferenceTargetPlaceholder('transcribe')
    });

    if (!target) {
      return;
    }

    await this.autoTranscribeReferenceAudioForTarget(target);
  }

  public static async openLocalReferenceTextSettings(targetOverride?: LocalReferenceTarget): Promise<void> {
    const target = targetOverride ?? await this.chooseLocalReferenceTarget({
      allowBoth: true,
      placeHolder: this.getLocalReferenceTargetPlaceholder('edit')
    });

    if (!target) {
      return;
    }

    await this.openReferenceTextSettingsForTarget(target);
  }

  private static async getLocalReferenceWorkbenchState(): Promise<LocalReferenceWorkbenchState> {
    const cosyVoiceConfig = ConfigManager.getCosyVoiceConfig();
    const qwenTtsConfig = ConfigManager.getQwenTtsConfig();
    const defaultReferenceText = this.getLocalReferencePromptTextPlaceholder();

    return {
      labels: this.getLocalReferenceWorkbenchLabels(),
      providers: [
        {
          id: 'cosyvoice',
          title: 'CosyVoice',
          repoUrl: 'https://github.com/FunAudioLLM/CosyVoice',
          promptAudioPath: cosyVoiceConfig.promptAudioPath || '',
          promptText: cosyVoiceConfig.promptText || '',
          defaultReferenceText,
          editableFields: [
            {
              id: 'cosyvoice-base-url',
              label: this.isChineseLocale() ? '服务地址' : 'Service Address',
              value: cosyVoiceConfig.baseUrl || 'http://127.0.0.1:50000',
              placeholder: I18n.t('config.prompts.cosyVoiceBaseUrlPlaceholder'),
              submitLabel: this.getLocalReferenceWorkbenchSubmitLabel(),
              mono: true
            }
          ]
        },
        {
          id: 'qwen3-tts',
          title: 'Qwen3-TTS',
          repoUrl: 'https://github.com/Blaizzy/mlx-audio',
          promptAudioPath: qwenTtsConfig.promptAudioPath || '',
          promptText: qwenTtsConfig.promptText || '',
          defaultReferenceText,
          editableFields: [
            {
              id: 'qwen-python-path',
              label: this.isChineseLocale() ? 'Python 路径' : 'Python Path',
              value: this.getQwenTtsPythonPathInputValue(),
              placeholder: this.getQwenTtsDefaultPythonPathValue(),
              submitLabel: this.getLocalReferenceWorkbenchSubmitLabel(),
              mono: true
            },
            {
              id: 'qwen-model',
              label: this.isChineseLocale() ? '模型 ID' : 'Model ID',
              value: qwenTtsConfig.model || this.getQwenTtsDefaultModelValue(),
              placeholder: this.getQwenTtsDefaultModelValue(),
              submitLabel: this.getLocalReferenceWorkbenchSubmitLabel(),
              mono: true
            }
          ]
        }
      ]
    };
  }

  private static async saveInlineRecording(
    providerId: 'cosyvoice' | 'qwen3-tts',
    audioBuffer: Uint8Array,
    referenceText: string
  ): Promise<void> {
    const suggestedFileName = `${providerId}-reference-${this.createTimestampFileStem()}.wav`;
    const defaultPath = providerId === 'qwen3-tts'
      ? this.getDefaultQwenTtsReferenceAudioPath(suggestedFileName)
      : this.getDefaultCosyVoiceReferenceAudioPath(suggestedFileName);

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultPath),
      filters: { Audio: ['wav'] },
      saveLabel: this.getRecordReferenceAudioLabel(),
      title: providerId === 'qwen3-tts' ? this.getQwenTtsSaveAudioTitle() : this.getCosyVoiceSaveAudioTitle()
    });

    if (!saveUri) {
      return;
    }

    await fs.mkdir(path.dirname(saveUri.fsPath), { recursive: true });
    await fs.writeFile(saveUri.fsPath, audioBuffer);

    if (referenceText.trim()) {
      await this.updateReferenceTranscriptForTarget(providerId, referenceText.trim());
    }

    await this.updateReferenceAudioForTarget(providerId, saveUri.fsPath);
  }

  private static async saveReferenceTextForProvider(
    providerId: 'cosyvoice' | 'qwen3-tts',
    text: string
  ): Promise<void> {
    const trimmed = text.trim();
    if (providerId === 'cosyvoice') {
      await ConfigManager.updateProjectConfig('cosyVoicePromptText', trimmed);
    } else {
      await ConfigManager.updateProjectConfig('qwenTtsPromptText', trimmed);
    }
  }

  private static async saveLocalReferenceWorkbenchField(
    fieldId: LocalReferenceWorkbenchFieldId,
    value: string
  ): Promise<void> {
    const trimmedValue = value.trim();

    switch (fieldId) {
      case 'cosyvoice-base-url':
        await ConfigManager.updateProjectConfig('cosyVoiceBaseUrl', trimmedValue || 'http://127.0.0.1:50000');
        return;
      case 'qwen-python-path':
        await ConfigManager.updateProjectConfig('qwenTtsPythonPath', trimmedValue || this.getQwenTtsDefaultPythonPathValue());
        return;
      case 'qwen-model':
        await ConfigManager.updateProjectConfig('qwenTtsModel', trimmedValue || this.getQwenTtsDefaultModelValue());
        return;
    }
  }

  public static async recordCosyVoiceReferenceAudio(): Promise<void> {
    await this.openLocalReferenceWorkbench();
  }

  public static async recordQwenTtsReferenceAudio(): Promise<void> {
    await this.openLocalReferenceWorkbench();
  }

  private static async selectReferenceAudioForTarget(target: LocalReferenceTarget): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: this.getLocalReferenceSelectActionLabel(),
      filters: {
        Media: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v']
      },
      title: this.getLocalReferenceSelectMediaTitle(target)
    });

    const selected = picked?.[0];
    if (!selected) {
      return;
    }

    const selectedPath = selected.fsPath;
    const selectedWasVideo = ReferenceMediaService.isVideoFile(selectedPath);
    const resolvedAudioPath = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: this.getLocalReferencePrepareMediaTitle(target),
        cancellable: false
      },
      async () => ReferenceMediaService.resolveReferenceAudioPath(selectedPath)
    );

    await this.updateReferenceAudioForTarget(target, resolvedAudioPath);

    if (!selectedWasVideo) {
      return;
    }

    if (target === 'cosyvoice') {
      await this.transcribeVideoReferenceAndOpenSettings(resolvedAudioPath);
      return;
    }

    if (target === 'qwen3-tts') {
      await this.transcribeQwenTtsVideoReferenceAndOpenSettings(resolvedAudioPath);
      return;
    }

    await this.transcribeSharedVideoReferenceAndOpenSettings(resolvedAudioPath);
  }

  private static async autoTranscribeReferenceAudioForTarget(target: LocalReferenceTarget): Promise<void> {
    if (target === 'cosyvoice') {
      await this.autoTranscribeCosyVoiceReferenceAudio();
      return;
    }

    if (target === 'qwen3-tts') {
      await this.autoTranscribeQwenTtsReferenceAudio();
      return;
    }

    const source = await this.resolveSharedReferenceSource();
    if (!source) {
      return;
    }

    const languageChoice = await vscode.window.showQuickPick(
      this.getReferenceTranscriptionLanguageItems(),
      {
        title: this.getLocalReferenceMenuTitle(),
        placeHolder: this.getLocalReferenceTranscriptionLanguagePlaceholder()
      }
    );

    if (!languageChoice) {
      return;
    }

    const transcript = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: I18n.t('progress.transcribingReferenceAudio'),
        cancellable: false
      },
      async () =>
        CosyVoiceReferenceService.transcribeReferenceAudio(source.audioPath, {
          language: languageChoice.language,
          ...(source.pythonPath ? { pythonPath: source.pythonPath } : {})
        })
    );

    await this.updateReferenceTranscriptForTarget('both', transcript);
    vscode.window.showInformationMessage(I18n.t('notifications.success.referenceTranscriptUpdated', transcript));
  }

  private static async openReferenceTextSettingsForTarget(target: LocalReferenceTarget): Promise<void> {
    await this.seedSpeechifyWorkspaceSettings();

    if (target === 'qwen3-tts') {
      await this.openProjectSettingsAtKey('speechify.qwenTts.promptText');
      return;
    }

    await this.openProjectSettingsAtKey('speechify.cosyVoice.promptText');
  }

  public static async selectQwenTtsPythonPathFromDialog(): Promise<string | undefined> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: this.getQwenTtsSelectPythonPathOpenLabel(),
      title: this.getQwenTtsSelectPythonPathTitle()
    });

    const selected = picked?.[0];
    if (!selected) {
      return undefined;
    }

    const selectedPath = selected.fsPath;
    await ConfigManager.updateProjectConfig('qwenTtsPythonPath', this.toWorkspaceSettingPath(selectedPath));
    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
    return selectedPath;
  }

  private static async autoTranscribeCosyVoiceReferenceAudio(): Promise<void> {
    const current = ConfigManager.getCosyVoiceConfig();
    if (!current.promptAudioPath) {
      throw new Error(I18n.t('errors.referenceAudioNotConfigured'));
    }

    const languageChoice = await vscode.window.showQuickPick(
      this.getReferenceTranscriptionLanguageItems(),
      {
        title: this.getCosyVoiceMenuTitle(),
        placeHolder: I18n.t('config.prompts.cosyVoiceSelectTranscriptionLanguage')
      }
    );

    if (!languageChoice) {
      return;
    }

    const transcript = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: I18n.t('progress.transcribingReferenceAudio'),
        cancellable: false
      },
      async () =>
        CosyVoiceReferenceService.transcribeReferenceAudio(current.promptAudioPath, {
          language: languageChoice.language
        })
    );

    await ConfigManager.updateProjectConfig('cosyVoicePromptText', transcript);
    vscode.window.showInformationMessage(I18n.t('notifications.success.referenceTranscriptUpdated', transcript));
  }

  private static async autoTranscribeQwenTtsReferenceAudio(): Promise<void> {
    const current = ConfigManager.getQwenTtsConfig();
    if (!current.promptAudioPath) {
      throw new Error(I18n.t('errors.referenceAudioNotConfigured'));
    }

    const languageChoice = await vscode.window.showQuickPick(
      this.getReferenceTranscriptionLanguageItems(),
      {
        title: this.getQwenTtsMenuTitle(),
        placeHolder: this.getQwenTtsSelectTranscriptionLanguagePlaceholder()
      }
    );

    if (!languageChoice) {
      return;
    }

    const transcript = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: I18n.t('progress.transcribingReferenceAudio'),
        cancellable: false
      },
      async () =>
        CosyVoiceReferenceService.transcribeReferenceAudio(current.promptAudioPath, {
          language: languageChoice.language,
          pythonPath: current.pythonPath
        })
    );

    await ConfigManager.updateProjectConfig('qwenTtsPromptText', transcript);
    vscode.window.showInformationMessage(I18n.t('notifications.success.referenceTranscriptUpdated', transcript));
  }

  private static async editCosyVoiceBackendUrl(): Promise<void> {
    const current = ConfigManager.getCosyVoiceConfig();
    const baseUrl = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.cosyVoiceBaseUrl'),
      value: current.baseUrl || 'http://127.0.0.1:50000',
      placeHolder: I18n.t('config.prompts.cosyVoiceBaseUrlPlaceholder')
    });

    if (baseUrl === undefined) {
      return;
    }

    await ConfigManager.updateProjectConfig('cosyVoiceBaseUrl', baseUrl.trim());
  }

  private static async editQwenTtsModel(): Promise<void> {
    const current = ConfigManager.getQwenTtsConfig();
    const model = await vscode.window.showInputBox({
      prompt: this.getQwenTtsModelPrompt(),
      value: current.model || 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16',
      placeHolder: 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16'
    });

    if (model === undefined) {
      return;
    }

    await ConfigManager.updateProjectConfig('qwenTtsModel', model.trim());
  }

  private static async editQwenTtsPythonPath(): Promise<void> {
    const pythonPath = await vscode.window.showInputBox({
      prompt: this.getQwenTtsPythonPathPrompt(),
      value: this.getQwenTtsPythonPathInputValue(),
      placeHolder: this.getQwenTtsDefaultPythonPathValue()
    });

    if (pythonPath === undefined) {
      return;
    }

    await ConfigManager.updateProjectConfig('qwenTtsPythonPath', pythonPath.trim());
  }

  private static toWorkspaceSettingPath(filePath: string): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return filePath;
    }

    const relativePath = path.relative(workspaceRoot, filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return `\${workspaceFolder}/${relativePath.replace(/\\/g, '/')}`;
    }

    return filePath;
  }

  private static async updateReferenceAudioForTarget(target: LocalReferenceTarget, filePath: string): Promise<void> {
    const storedPath = this.toWorkspaceSettingPath(filePath);

    if (target === 'cosyvoice') {
      await ConfigManager.updateProjectConfig('cosyVoicePromptAudioPath', storedPath);
    } else if (target === 'qwen3-tts') {
      await ConfigManager.updateProjectConfig('qwenTtsPromptAudioPath', storedPath);
    } else {
      await ConfigManager.updateProjectConfig('cosyVoicePromptAudioPath', storedPath);
      await ConfigManager.updateProjectConfig('qwenTtsPromptAudioPath', storedPath);
    }

    const autoTranscribeLabel = I18n.t('actions.autoTranscribeReference');
    const revealLabel = I18n.t('actions.showInExplorer');
    const selectedAction = await vscode.window.showInformationMessage(
      this.getReferenceAudioUpdatedMessage(target),
      autoTranscribeLabel,
      revealLabel,
      I18n.t('actions.ok')
    );

    if (selectedAction === autoTranscribeLabel) {
      await this.autoTranscribeReferenceAudioForTarget(target);
      return;
    }

    if (selectedAction === revealLabel) {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
    }
  }

  private static async updateReferenceTranscriptForTarget(target: LocalReferenceTarget, transcript: string): Promise<void> {
    if (target === 'cosyvoice') {
      await ConfigManager.updateProjectConfig('cosyVoicePromptText', transcript);
      return;
    }

    if (target === 'qwen3-tts') {
      await ConfigManager.updateProjectConfig('qwenTtsPromptText', transcript);
      return;
    }

    await ConfigManager.updateProjectConfig('cosyVoicePromptText', transcript);
    await ConfigManager.updateProjectConfig('qwenTtsPromptText', transcript);
  }

  private static async resolveSharedReferenceSource(): Promise<{
    audioPath: string;
    pythonPath?: string;
  } | undefined> {
    const cosyVoiceConfig = ConfigManager.getCosyVoiceConfig();
    const qwenTtsConfig = ConfigManager.getQwenTtsConfig();
    const cosyAudioPath = cosyVoiceConfig.promptAudioPath || '';
    const qwenAudioPath = qwenTtsConfig.promptAudioPath || '';

    if (!cosyAudioPath && !qwenAudioPath) {
      throw new Error(I18n.t('errors.referenceAudioNotConfigured'));
    }

    if (cosyAudioPath && qwenAudioPath && cosyAudioPath !== qwenAudioPath) {
      const sourceChoice = await vscode.window.showQuickPick(
        [
          {
            label: 'CosyVoice',
            description: cosyAudioPath,
            audioPath: cosyAudioPath,
            pythonPath: cosyVoiceConfig.pythonPath || undefined
          },
          {
            label: 'Qwen3-TTS',
            description: qwenAudioPath,
            audioPath: qwenAudioPath,
            pythonPath: qwenTtsConfig.pythonPath || undefined
          }
        ],
        {
          title: this.getLocalReferenceMenuTitle(),
          placeHolder: this.getLocalReferenceSourcePlaceholder()
        }
      );

      if (!sourceChoice) {
        return undefined;
      }

      return {
        audioPath: sourceChoice.audioPath,
        ...(sourceChoice.pythonPath ? { pythonPath: sourceChoice.pythonPath } : {})
      };
    }

    if (qwenAudioPath) {
      return {
        audioPath: qwenAudioPath,
        ...(qwenTtsConfig.pythonPath ? { pythonPath: qwenTtsConfig.pythonPath } : {})
      };
    }

    return {
      audioPath: cosyAudioPath,
      ...(cosyVoiceConfig.pythonPath ? { pythonPath: cosyVoiceConfig.pythonPath } : {})
    };
  }

  private static async transcribeVideoReferenceAndOpenSettings(audioPath: string): Promise<void> {
    try {
      const transcript = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: this.getCosyVoiceAutoTranscribeVideoTitle(),
          cancellable: false
        },
        async () =>
          CosyVoiceReferenceService.transcribeReferenceAudio(audioPath, {
            language: 'auto'
          })
      );

      await ConfigManager.updateProjectConfig('cosyVoicePromptText', transcript);
      await this.openProjectSettingsAtKey('speechify.cosyVoice.promptText');
      vscode.window.showInformationMessage(this.getCosyVoiceVideoTranscriptionReadyMessage());
    } catch (error) {
      await this.openProjectSettingsAtKey('speechify.cosyVoice.promptText');
      vscode.window.showWarningMessage(
        error instanceof Error ? error.message : I18n.t('errors.failedToTranscribeReferenceAudio')
      );
    }
  }

  private static async transcribeQwenTtsVideoReferenceAndOpenSettings(audioPath: string): Promise<void> {
    const current = ConfigManager.getQwenTtsConfig();

    try {
      const transcript = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: this.getQwenTtsAutoTranscribeVideoTitle(),
          cancellable: false
        },
        async () =>
          CosyVoiceReferenceService.transcribeReferenceAudio(audioPath, {
            language: 'auto',
            pythonPath: current.pythonPath
          })
      );

      await ConfigManager.updateProjectConfig('qwenTtsPromptText', transcript);
      await this.openProjectSettingsAtKey('speechify.qwenTts.promptText');
      vscode.window.showInformationMessage(this.getQwenTtsVideoTranscriptionReadyMessage());
    } catch (error) {
      await this.openProjectSettingsAtKey('speechify.qwenTts.promptText');
      vscode.window.showWarningMessage(
        error instanceof Error ? error.message : I18n.t('errors.failedToTranscribeReferenceAudio')
      );
    }
  }

  private static async transcribeSharedVideoReferenceAndOpenSettings(audioPath: string): Promise<void> {
    const source = await this.resolveSharedReferenceSourceForPath(audioPath);

    try {
      const transcript = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: this.getSharedVideoTranscriptionTitle(),
          cancellable: false
        },
        async () =>
          CosyVoiceReferenceService.transcribeReferenceAudio(audioPath, {
            language: 'auto',
            ...(source.pythonPath ? { pythonPath: source.pythonPath } : {})
          })
      );

      await this.updateReferenceTranscriptForTarget('both', transcript);
      await this.openProjectSettingsAtKey('speechify.cosyVoice.promptText');
      vscode.window.showInformationMessage(this.getSharedVideoTranscriptionReadyMessage());
    } catch (error) {
      await this.openProjectSettingsAtKey('speechify.cosyVoice.promptText');
      vscode.window.showWarningMessage(
        error instanceof Error ? error.message : I18n.t('errors.failedToTranscribeReferenceAudio')
      );
    }
  }

  private static async resolveSharedReferenceSourceForPath(audioPath: string): Promise<{ pythonPath?: string }> {
    const cosyVoiceConfig = ConfigManager.getCosyVoiceConfig();
    const qwenTtsConfig = ConfigManager.getQwenTtsConfig();

    if (qwenTtsConfig.promptAudioPath === audioPath && qwenTtsConfig.pythonPath) {
      return { pythonPath: qwenTtsConfig.pythonPath };
    }

    if (cosyVoiceConfig.promptAudioPath === audioPath && cosyVoiceConfig.pythonPath) {
      return { pythonPath: cosyVoiceConfig.pythonPath };
    }

    if (qwenTtsConfig.pythonPath) {
      return { pythonPath: qwenTtsConfig.pythonPath };
    }

    if (cosyVoiceConfig.pythonPath) {
      return { pythonPath: cosyVoiceConfig.pythonPath };
    }

    return {};
  }

  private static createTimestampFileStem(): string {
    const now = new Date();
    const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  private static getDefaultCosyVoiceReferenceAudioPath(suggestedFileName: string): string {
    const normalizedName = suggestedFileName.toLowerCase().endsWith('.wav')
      ? suggestedFileName
      : `${suggestedFileName}.wav`;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const baseDir = workspaceRoot
      ? path.join(workspaceRoot, '.speechify', 'reference-audio')
      : path.join(os.homedir(), 'Downloads');

    return path.join(baseDir, normalizedName);
  }

  private static getDefaultQwenTtsReferenceAudioPath(suggestedFileName: string): string {
    const normalizedName = suggestedFileName.toLowerCase().endsWith('.wav')
      ? suggestedFileName
      : `${suggestedFileName}.wav`;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const baseDir = workspaceRoot
      ? path.join(workspaceRoot, '.speechify', 'reference-audio')
      : path.join(os.homedir(), 'Downloads');

    return path.join(baseDir, normalizedName.replace(/^cosyvoice-reference/, 'qwen3-tts-reference'));
  }

  private static getRecordReferenceAudioLabel(): string {
    return vscode.env.language.toLowerCase().startsWith('zh') ? '录制参考音频' : 'Record Reference Audio';
  }

  private static getCosyVoiceSaveAudioTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '保存 CosyVoice 参考音频'
      : 'Save CosyVoice Reference Audio';
  }

  private static getQwenTtsSaveAudioTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '保存 Qwen3-TTS 参考音频'
      : 'Save Qwen3-TTS Reference Audio';
  }

  private static getCosyVoiceSelectReferenceMediaTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择用于声音克隆的参考音频或视频'
      : 'Select reference audio or video for voice cloning';
  }

  private static getQwenTtsSelectReferenceMediaTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择用于 Qwen3-TTS 声音克隆的参考音频或视频'
      : 'Select reference audio or video for Qwen3-TTS voice cloning';
  }

  private static getCosyVoicePrepareReferenceMediaTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '正在准备参考媒体...'
      : 'Preparing reference media...';
  }

  private static getQwenTtsPrepareReferenceMediaTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '正在准备 Qwen3-TTS 参考媒体...'
      : 'Preparing Qwen3-TTS reference media...';
  }

  private static getLocalReferenceSelectActionLabel(): string {
    return this.isChineseLocale() ? '选择参考音频/视频' : 'Select Reference Audio / Video';
  }

  private static getLocalReferenceSelectMediaTitle(target: LocalReferenceTarget): string {
    if (target === 'cosyvoice') {
      return this.getCosyVoiceSelectReferenceMediaTitle();
    }

    if (target === 'qwen3-tts') {
      return this.getQwenTtsSelectReferenceMediaTitle();
    }

    return this.isChineseLocale()
      ? '选择共享给本地模型的参考音频或视频'
      : 'Select reference audio or video shared by local models';
  }

  private static getLocalReferencePrepareMediaTitle(target: LocalReferenceTarget): string {
    if (target === 'cosyvoice') {
      return this.getCosyVoicePrepareReferenceMediaTitle();
    }

    if (target === 'qwen3-tts') {
      return this.getQwenTtsPrepareReferenceMediaTitle();
    }

    return this.isChineseLocale()
      ? '正在准备本地模型共享参考媒体...'
      : 'Preparing shared local reference media...';
  }

  private static getCosyVoiceAutoTranscribeVideoTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '正在从视频参考中转录文本...'
      : 'Transcribing text from reference video...';
  }

  private static getQwenTtsAutoTranscribeVideoTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '正在从 Qwen3-TTS 参考视频中转录文本...'
      : 'Transcribing text from Qwen3-TTS reference video...';
  }

  private static getCosyVoiceVideoTranscriptionReadyMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '已自动转录参考视频，并打开工作区设置供你修改参考文本。'
      : 'Reference video transcribed. Workspace settings are open so you can edit the reference text.';
  }

  private static getQwenTtsVideoTranscriptionReadyMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '已自动转录 Qwen3-TTS 参考视频，并打开工作区设置供你修改参考文本。'
      : 'Qwen3-TTS reference video transcribed. Workspace settings are open so you can edit the reference text.';
  }

  private static getSharedVideoTranscriptionTitle(): string {
    return this.isChineseLocale()
      ? '正在从共享参考视频中转录文本...'
      : 'Transcribing text from the shared reference video...';
  }

  private static getSharedVideoTranscriptionReadyMessage(): string {
    return this.isChineseLocale()
      ? '已自动转录共享参考视频，并打开工作区设置供你同时检查 CosyVoice 与 Qwen3-TTS 的参考文本。'
      : 'Shared reference video transcribed. Workspace settings are open so you can review both CosyVoice and Qwen3-TTS transcripts.';
  }

  private static getQwenTtsEditModelLabel(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '编辑模型 ID'
      : 'Edit Model ID';
  }

  private static getQwenTtsEditPythonPathLabel(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '编辑 Python 路径'
      : 'Edit Python Path';
  }

  private static getCosyVoiceSelectActionPlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择你要配置的 CosyVoice 本地项'
      : 'Choose what to configure for your local CosyVoice setup';
  }

  private static getQwenTtsSelectActionPlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择你要配置的 Qwen3-TTS 本地项'
      : 'Choose what to configure for your local Qwen3-TTS setup';
  }

  private static async openGitHubRepo(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private static getQwenTtsSelectTranscriptionLanguagePlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择参考音频的转录语言'
      : 'Choose the transcription language for the reference audio';
  }

  private static getQwenTtsModelPrompt(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '请输入 Qwen3-TTS 的 MLX 模型 ID 或本地模型路径'
      : 'Enter the Qwen3-TTS MLX model id or local model path';
  }

  private static getQwenTtsDefaultModelValue(): string {
    return 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16';
  }

  private static getQwenTtsPythonPathPrompt(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '请输入运行 MLX-Audio 的 Python 路径（可直接接受默认值）'
      : 'Enter the Python path used to run MLX-Audio (you can accept the suggested default)';
  }

  private static getQwenTtsReferenceAudioUpdatedMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? 'Qwen3-TTS 参考音频已更新。'
      : 'Qwen3-TTS reference audio updated.';
  }

  private static getReferenceAudioUpdatedMessage(target: LocalReferenceTarget): string {
    if (target === 'cosyvoice') {
      return I18n.t('notifications.success.referenceAudioUpdated');
    }

    if (target === 'qwen3-tts') {
      return this.getQwenTtsReferenceAudioUpdatedMessage();
    }

    return this.isChineseLocale()
      ? '本地模型共享参考音频已更新。'
      : 'Shared local reference audio updated.';
  }

  private static getQwenTtsSelectPythonPathTitle(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择 Qwen3-TTS 的 Python 可执行文件'
      : 'Select the Python executable for Qwen3-TTS';
  }

  private static getQwenTtsSelectPythonPathOpenLabel(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择 Python 路径'
      : 'Select Python Path';
  }

  private static async openProjectSettingsAtKey(settingKey: string): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      await vscode.commands.executeCommand('workbench.action.openSettingsJson');
      return;
    }

    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });

    try {
      await fs.access(settingsPath);
    } catch {
      await fs.writeFile(settingsPath, '{}\n');
    }

    const document = await vscode.workspace.openTextDocument(settingsPath);
    const editor = await vscode.window.showTextDocument(document, {
      preview: false
    });

    const settingIndex = document.getText().indexOf(`"${settingKey}"`);
    const position = settingIndex >= 0 ? document.positionAt(settingIndex) : new vscode.Position(0, 0);
    const selection = new vscode.Selection(position, position);
    editor.selection = selection;
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }

  public static async openSpeechifySettingsJson(): Promise<void> {
    await this.seedSpeechifyWorkspaceSettings();
    await this.openProjectSettingsAtKey('speechify.provider');
  }

  private static async seedSpeechifyWorkspaceSettings(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });

    let currentText = '{}\n';
    try {
      currentText = await fs.readFile(settingsPath, 'utf8');
    } catch {
      await fs.writeFile(settingsPath, currentText);
    }

    const nextText = upsertSpeechifyWorkspaceSettingsJsonText(currentText, this.getSpeechifyWorkspaceSeedConfig());
    if (nextText !== currentText) {
      await fs.writeFile(settingsPath, nextText, 'utf8');
    }
  }

  private static getSpeechifyWorkspaceSeedConfig(): SpeechifyConfig {
    const effectiveConfig = { ...ConfigManager.getWorkspaceConfig() };
    if (!(effectiveConfig.qwenTtsPythonPath || '').trim()) {
      effectiveConfig.qwenTtsPythonPath = this.getQwenTtsPythonPathInputValue();
    }

    return effectiveConfig;
  }

  private static getQwenTtsPythonPathDescription(): string {
    const configuredPythonPath = this.getConfiguredQwenTtsPythonPath();
    if (configuredPythonPath) {
      return configuredPythonPath;
    }

    const detectedPythonPath = this.getDetectedQwenTtsPythonPath();
    if (detectedPythonPath) {
      return this.getQwenTtsAutoDetectedPythonPathLabel(detectedPythonPath);
    }

    return this.getQwenTtsDefaultPythonPathLabel(this.getQwenTtsDefaultPythonPathValue());
  }

  private static getQwenTtsPythonPathInputValue(): string {
    const configuredPythonPath = this.getConfiguredQwenTtsPythonPath();
    if (configuredPythonPath) {
      return configuredPythonPath;
    }

    const detectedPythonPath = this.getDetectedQwenTtsPythonPath();
    if (detectedPythonPath) {
      return detectedPythonPath;
    }

    return this.getQwenTtsDefaultPythonPathValue();
  }

  private static getConfiguredQwenTtsPythonPath(): string {
    const configuredPythonPath = (ConfigManager.getWorkspaceConfig().qwenTtsPythonPath || '').trim();
    if (!configuredPythonPath) {
      return '';
    }

    if (configuredPythonPath === ConfigManager.getDefaultQwenTtsPythonPathSetting()) {
      const fsSync = require('fs') as typeof import('fs');
      if (!fsSync.existsSync(ConfigManager.getResolvedDefaultQwenTtsPythonPath())) {
        return '';
      }
    }

    return configuredPythonPath;
  }

  private static getDetectedQwenTtsPythonPath(): string {
    const detectedPythonPath = ConfigManager.getDetectedQwenTtsPythonPath();
    return detectedPythonPath ? this.toWorkspaceSettingPath(detectedPythonPath) : '';
  }

  private static getQwenTtsDefaultPythonPathValue(): string {
    return ConfigManager.getDefaultQwenTtsPythonPathSetting();
  }

  private static getQwenTtsAutoDetectedPythonPathLabel(pythonPath: string): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? `自动探测: ${pythonPath}`
      : `Auto-detected: ${pythonPath}`;
  }

  private static getQwenTtsDefaultPythonPathLabel(pythonPath: string): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? `默认建议: ${pythonPath}`
      : `Suggested default: ${pythonPath}`;
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
    const provider = ConfigManager.getSpeechProvider();

    if (provider === 'cosyvoice') {
      await this.configureCosyVoiceSettings();
      return;
    }

    if (provider === 'qwen3-tts') {
      await this.configureQwenTtsSettings();
      return;
    }

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
    if (ConfigManager.getSpeechProvider() !== 'azure') {
      const voiceName = ConfigManager.getVoiceSettings().name;
      vscode.window.showInformationMessage(I18n.t('errors.voiceNoStyles', voiceName));
      return;
    }

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

    const styleItems = currentVoice.StyleList.map(style => ({
      label: style,
      description: this.getStyleDescription(style)
    }));
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
      title: this.getSelectStylePlaceholder(currentVoice.DisplayName)
    });

    if (!selectedStyleItem) return;

    const selectedStyle = selectedStyleItem.label.startsWith('★ ')
      ? selectedStyleItem.label.substring(2)
      : selectedStyleItem.label;

    await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);

    vscode.window.showInformationMessage(I18n.t('notifications.success.voiceStyleChanged', selectedStyle));
  }

  public static async selectVoiceRole(): Promise<void> {
    if (ConfigManager.getSpeechProvider() !== 'azure') {
      const voiceName = ConfigManager.getVoiceSettings().name;
      vscode.window.showInformationMessage(I18n.t('notifications.info.noRolesAvailable', voiceName));
      return;
    }

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
          detail: this.getVoiceCountDetail(voiceList.filter(v => v.LocaleName === localeName).length)
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
      title: this.getSelectLanguageStepTitle()
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
            ? this.getVoiceStylesDetail(voice.StyleList)
            : this.getDefaultStyleOnlyDetail(),
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
      title: this.getSelectVoiceStepTitle(localeName)
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
      placeHolder: this.getSelectStylePlaceholder(voice.DisplayName),
      title: this.getSelectVoiceStyleStepTitle()
    });

    const selectedStyle = selectedStyleItem?.label.startsWith('★ ')
      ? selectedStyleItem.label.substring(2)
      : selectedStyleItem?.label;

    return selectedStyle || 'general';
  }

  private static getStyleDescription(style: string): string {
    if (this.isChineseLocale()) {
      const chineseStyleDescriptions: { [key: string]: string } = {
        general: '默认中性风格',
        cheerful: '轻快愉悦',
        sad: '低沉伤感',
        angry: '生气严厉',
        fearful: '紧张害怕',
        disgruntled: '抱怨不满',
        serious: '严肃有力',
        affectionate: '温暖亲切',
        gentle: '温和礼貌',
        calm: '冷静平稳',
        newscast: '正式播报风格',
        customerservice: '客服式友好风格',
        assistant: '数字助手风格',
        chat: '日常对话风格',
        hopeful: '积极鼓舞',
        excited: '热情兴奋'
      };

      return chineseStyleDescriptions[style] || '语音风格';
    }

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

  private static getSpeechProviderQuickPickItems(currentProvider: SpeechProviderType): Array<{
    label: string;
    description: string;
    provider: 'azure' | 'cosyvoice' | 'qwen3-tts';
  }> {
    return [
      {
        label: this.isChineseLocale() ? 'Azure Speech' : 'Azure Speech',
        description: currentProvider === 'azure' ? I18n.t('settings.current') : '',
        provider: 'azure'
      },
      {
        label: this.isChineseLocale() ? 'CosyVoice（本地）' : 'CosyVoice (Local)',
        description: currentProvider === 'cosyvoice' ? I18n.t('settings.current') : '',
        provider: 'cosyvoice'
      },
      {
        label: this.isChineseLocale() ? 'Qwen3-TTS + MLX-Audio（本地）' : 'Qwen3-TTS + MLX-Audio (Local)',
        description: currentProvider === 'qwen3-tts' ? I18n.t('settings.current') : '',
        provider: 'qwen3-tts'
      }
    ];
  }

  private static getSpeechProviderPickerTitle(): string {
    return this.isChineseLocale() ? '选择语音后端' : 'Select Speech Backend';
  }

  private static getSpeechProviderPickerPlaceholder(): string {
    return this.isChineseLocale()
      ? '选择要配置的语音后端'
      : 'Choose the speech backend to configure';
  }

  private static getCosyVoiceMenuTitle(): string {
    return this.isChineseLocale() ? 'CosyVoice（本地）' : 'CosyVoice';
  }

  private static getQwenTtsMenuTitle(): string {
    return this.isChineseLocale() ? 'Qwen3-TTS + MLX-Audio（本地）' : 'Qwen3-TTS + MLX-Audio';
  }

  private static getLocalReferenceMenuTitle(): string {
    return this.isChineseLocale() ? '本地模型共享参考音频' : 'Shared Local Reference';
  }

  private static getLocalReferenceWorkbenchLabels(): LocalReferenceWorkbenchState['labels'] {
    if (this.isChineseLocale()) {
      return {
        title: '配置本地模型',
        subtitle: '在同一控制台里配置 CosyVoice 与 Qwen3-TTS 的关键参数，并统一管理录音、参考音频和参考文本。基准测试（Apple M3 Max 64GB）：Qwen3-TTS 0.6B 约 58–75 ms/字符（自包含，无需服务器）；CosyVoice-300M+MPS 约 64–93 ms/字符（需本地服务器，支持声音克隆，性能与 Qwen3-TTS 相当）。',
        providerLabel: '本地模型配置',
        record: '录制参考音频',
        stopRecording: '停止录制',
        retryRecording: '重录',
        saveRecording: '保存录音',
        selectMedia: '选择音频/视频',
        transcribe: '自动转录',
        idle: '空闲',
        recording: '录制中',
        processing: '处理中',
        ready: '已就绪',
        preview: '试听',
        referenceTextLabel: '参考文本',
        referenceTextSave: '保存',
        noAudioConfigured: '尚未配置参考音频',
        microphoneError: '录制失败，请检查麦克风权限和默认输入设备后重试。'
      };
    }

    return {
      title: 'Configure Local Models',
      subtitle: 'Configure CosyVoice and Qwen3-TTS in one place. Benchmark (Apple M3 Max 64GB): Qwen3-TTS 0.6B ~58–75 ms/char, self-contained (no server needed); CosyVoice-300M+MPS ~64–93 ms/char, requires a local server but supports voice cloning with comparable performance.',
      providerLabel: 'Local Model Settings',
      record: 'Record',
      stopRecording: 'Stop',
      retryRecording: 'Retry',
      saveRecording: 'Save Recording',
      selectMedia: 'Select Audio / Video',
      transcribe: 'Auto-Transcribe',
      idle: 'Idle',
      recording: 'Recording',
      processing: 'Processing',
      ready: 'Ready',
      preview: 'Preview',
      referenceTextLabel: 'Reference Text',
      referenceTextSave: 'Save',
      noAudioConfigured: 'No reference audio configured',
      microphoneError: 'Recording failed. Check microphone permission and default input device.'
    };
  }

  private static getLocalReferenceWorkbenchSubmitLabel(): string {
    return this.isChineseLocale() ? '提交' : 'Save';
  }

  private static getLocalReferencePromptTextPlaceholder(): string {
    return this.isChineseLocale()
      ? '可直接粘贴或修改参考文本'
      : 'Paste or edit the reference text here';
  }

  private static async chooseLocalReferenceTarget(options: {
    allowBoth: boolean;
    placeHolder: string;
  }): Promise<LocalReferenceTarget | undefined> {
    const cosyVoiceConfig = ConfigManager.getCosyVoiceConfig();
    const qwenTtsConfig = ConfigManager.getQwenTtsConfig();
    const items: Array<vscode.QuickPickItem & { target: LocalReferenceTarget }> = [
      {
        label: 'CosyVoice',
        description: cosyVoiceConfig.promptAudioPath
          ? path.basename(cosyVoiceConfig.promptAudioPath)
          : I18n.t('settings.no'),
        target: 'cosyvoice'
      },
      {
        label: 'Qwen3-TTS',
        description: qwenTtsConfig.promptAudioPath
          ? path.basename(qwenTtsConfig.promptAudioPath)
          : I18n.t('settings.no'),
        target: 'qwen3-tts'
      }
    ];

    if (options.allowBoth) {
      items.push({
        label: this.isChineseLocale() ? '同时更新两个' : 'Apply to Both',
        description: this.isChineseLocale()
          ? '将同一份参考媒体同时写入 CosyVoice 和 Qwen3-TTS'
          : 'Use the same reference media for both CosyVoice and Qwen3-TTS',
        target: 'both'
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: this.getLocalReferenceMenuTitle(),
      placeHolder: options.placeHolder
    });

    return selected?.target;
  }

  private static getLocalReferenceTargetPlaceholder(
    action: 'record' | 'select' | 'transcribe' | 'edit'
  ): string {
    if (this.isChineseLocale()) {
      switch (action) {
        case 'record':
          return '选择要把录音保存到哪个本地模型';
        case 'select':
          return '选择要把参考音频/视频应用到哪个本地模型';
        case 'transcribe':
          return '选择要更新哪个本地模型的参考文本';
        case 'edit':
          return '选择要打开哪个本地模型的参考文本设置';
      }
    }

    switch (action) {
      case 'record':
        return 'Choose which local model should receive the recorded reference audio';
      case 'select':
        return 'Choose which local model should use the selected reference audio or video';
      case 'transcribe':
        return 'Choose which local model should receive the transcribed reference text';
      case 'edit':
        return 'Choose which local model reference text setting to open';
    }
  }

  private static getLocalReferenceTranscriptionLanguagePlaceholder(): string {
    return this.isChineseLocale()
      ? '选择共享参考音频的转录语言'
      : 'Choose the transcription language for the shared reference audio';
  }

  private static getLocalReferenceSourcePlaceholder(): string {
    return this.isChineseLocale()
      ? 'CosyVoice 和 Qwen3-TTS 使用了不同的参考媒体，选择要转录哪一个'
      : 'CosyVoice and Qwen3-TTS use different reference media. Choose which one to transcribe';
  }

  private static getReferenceTranscriptionLanguageItems(): Array<{
    label: string;
    language: 'zh' | 'auto' | 'en';
  }> {
    if (this.isChineseLocale()) {
      return [
        { label: '中文（推荐）', language: 'zh' },
        { label: '自动检测', language: 'auto' },
        { label: 'English', language: 'en' }
      ];
    }

    return [
      { label: 'Chinese (Recommended)', language: 'zh' },
      { label: 'Auto Detect', language: 'auto' },
      { label: 'English', language: 'en' }
    ];
  }

  private static getSelectLanguageStepTitle(): string {
    return this.isChineseLocale() ? '第 1/3 步：选择语言' : 'Step 1/3: Select Language';
  }

  private static getSelectVoiceStepTitle(localeName: string): string {
    return this.isChineseLocale()
      ? `第 2/3 步：选择语音 (${localeName})`
      : `Step 2/3: Select Voice for ${localeName}`;
  }

  private static getSelectVoiceStyleStepTitle(): string {
    return this.isChineseLocale() ? '第 3/3 步：选择语音风格' : 'Step 3/3: Select Voice Style';
  }

  private static getSelectStylePlaceholder(voiceDisplayName: string): string {
    return this.isChineseLocale()
      ? `选择 ${voiceDisplayName} 的语音风格`
      : `Select style for ${voiceDisplayName}`;
  }

  private static getVoiceCountDetail(count: number): string {
    return this.isChineseLocale() ? `共 ${count} 个语音可选` : `${count} voices available`;
  }

  private static getVoiceStylesDetail(styles: string[]): string {
    return this.isChineseLocale()
      ? `支持风格：${styles.join(', ')}`
      : `Styles: ${styles.join(', ')}`;
  }

  private static getDefaultStyleOnlyDetail(): string {
    return this.isChineseLocale() ? '仅默认风格' : 'Default style only';
  }

  private static isChineseLocale(): boolean {
    return vscode.env.language.toLowerCase().startsWith('zh');
  }

  private static getExtensionContextNotInitializedMessage(): string {
    return this.isChineseLocale()
      ? 'Speechify 扩展上下文尚未初始化。'
      : 'Speechify extension context is not initialized.';
  }
}
