import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SpeechProviderType, VoiceListItem } from '../types';
import { ConfigManager } from '../utils/config';
import { upsertSpeechifyWorkspaceSettingsJsonText } from '../utils/speechifySettings';
import { I18n } from '../i18n';
import { buildVisionConfigGuidance } from './visionGuidance';
import { CosyVoiceReferenceService } from './cosyVoiceReferenceService';
import { CosyVoiceRecorderPanel } from '../webview/cosyVoiceRecorderPanel';
import { ReferenceMediaService } from './referenceMediaService';

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
      [
        {
          label: 'Azure Speech',
          description: currentProvider === 'azure' ? I18n.t('settings.current') : '',
          provider: 'azure' as const
        },
        {
          label: 'CosyVoice (Local)',
          description: currentProvider === 'cosyvoice' ? I18n.t('settings.current') : '',
          provider: 'cosyvoice' as const
        },
        {
          label: 'Qwen3-TTS + MLX-Audio (Local)',
          description: currentProvider === 'qwen3-tts' ? I18n.t('settings.current') : '',
          provider: 'qwen3-tts' as const
        }
      ],
      {
        title: 'Select Speech Backend',
        placeHolder: 'Choose the speech backend to configure'
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
    const recordReferenceAudioLabel = this.getRecordReferenceAudioLabel();

    while (!isFinished) {
      const current = ConfigManager.getCosyVoiceConfig();
      const action = await vscode.window.showQuickPick(
        [
          {
            label: recordReferenceAudioLabel,
            description: current.promptAudioPath ? path.basename(current.promptAudioPath) : I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.selectReferenceAudio'),
            description: current.promptAudioPath || I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.autoTranscribeReference'),
            description: current.promptAudioPath ? path.basename(current.promptAudioPath) : I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.editReferenceTranscript'),
            description: current.promptText || I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.editBackendUrl'),
            description: current.baseUrl || 'http://127.0.0.1:50000'
          },
          {
            label: I18n.t('actions.finish'),
            description: ''
          }
        ],
        {
          title: 'CosyVoice',
          placeHolder: I18n.t('config.prompts.cosyVoiceSelectAction')
        }
      );

      if (!action || action.label === I18n.t('actions.finish')) {
        isFinished = true;
        continue;
      }

      if (action.label === recordReferenceAudioLabel) {
        await this.recordCosyVoiceReferenceAudio();
        continue;
      }

      if (action.label === I18n.t('actions.selectReferenceAudio')) {
        await this.selectCosyVoiceReferenceAudio();
        continue;
      }

      if (action.label === I18n.t('actions.autoTranscribeReference')) {
        await this.autoTranscribeCosyVoiceReferenceAudio();
        continue;
      }

      if (action.label === I18n.t('actions.editReferenceTranscript')) {
        await this.editCosyVoiceReferenceTranscript();
        continue;
      }

      if (action.label === I18n.t('actions.editBackendUrl')) {
        await this.editCosyVoiceBackendUrl();
      }
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  public static async configureQwenTtsSettings(): Promise<void> {
    let isFinished = false;
    const recordReferenceAudioLabel = this.getQwenTtsRecordReferenceAudioLabel();

    while (!isFinished) {
      const current = ConfigManager.getQwenTtsConfig();
      const action = await vscode.window.showQuickPick(
        [
          {
            label: recordReferenceAudioLabel,
            description: current.promptAudioPath ? path.basename(current.promptAudioPath) : I18n.t('settings.no')
          },
          {
            label: this.getQwenTtsSelectReferenceAudioLabel(),
            description: current.promptAudioPath || I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.autoTranscribeReference'),
            description: current.promptAudioPath ? path.basename(current.promptAudioPath) : I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.editReferenceTranscript'),
            description: current.promptText || I18n.t('settings.no')
          },
          {
            label: this.getQwenTtsEditModelLabel(),
            description: current.model || 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16'
          },
          {
            label: this.getQwenTtsEditPythonPathLabel(),
            description: current.pythonPath || I18n.t('settings.no')
          },
          {
            label: I18n.t('actions.finish'),
            description: ''
          }
        ],
        {
          title: 'Qwen3-TTS + MLX-Audio',
          placeHolder: this.getQwenTtsSelectActionPlaceholder()
        }
      );

      if (!action || action.label === I18n.t('actions.finish')) {
        isFinished = true;
        continue;
      }

      if (action.label === recordReferenceAudioLabel) {
        await this.recordQwenTtsReferenceAudio();
        continue;
      }

      if (action.label === this.getQwenTtsSelectReferenceAudioLabel()) {
        await this.selectQwenTtsReferenceAudio();
        continue;
      }

      if (action.label === I18n.t('actions.autoTranscribeReference')) {
        await this.autoTranscribeQwenTtsReferenceAudio();
        continue;
      }

      if (action.label === I18n.t('actions.editReferenceTranscript')) {
        await this.editQwenTtsReferenceTranscript();
        continue;
      }

      if (action.label === this.getQwenTtsEditModelLabel()) {
        await this.editQwenTtsModel();
        continue;
      }

      if (action.label === this.getQwenTtsEditPythonPathLabel()) {
        await this.editQwenTtsPythonPath();
      }
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  public static async recordCosyVoiceReferenceAudio(): Promise<void> {
    if (!this.extensionContext) {
      throw new Error('Speechify extension context is not initialized.');
    }

    const recorded = await CosyVoiceRecorderPanel.record(this.extensionContext);
    if (!recorded) {
      return;
    }

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(this.getDefaultCosyVoiceReferenceAudioPath(recorded.suggestedFileName)),
      filters: {
        Audio: ['wav']
      },
      saveLabel: this.getRecordReferenceAudioLabel(),
      title: this.getCosyVoiceSaveAudioTitle()
    });

    if (!saveUri) {
      return;
    }

    await fs.mkdir(path.dirname(saveUri.fsPath), { recursive: true });
    await fs.writeFile(saveUri.fsPath, recorded.audioBuffer);

    if (recorded.referenceText.trim()) {
      await ConfigManager.updateProjectConfig('cosyVoicePromptText', recorded.referenceText.trim());
    }

    await this.updateCosyVoiceReferenceAudio(saveUri.fsPath);
  }

  public static async recordQwenTtsReferenceAudio(): Promise<void> {
    if (!this.extensionContext) {
      throw new Error('Speechify extension context is not initialized.');
    }

    const recorded = await CosyVoiceRecorderPanel.record(this.extensionContext);
    if (!recorded) {
      return;
    }

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(this.getDefaultQwenTtsReferenceAudioPath(recorded.suggestedFileName)),
      filters: {
        Audio: ['wav']
      },
      saveLabel: this.getQwenTtsRecordReferenceAudioLabel(),
      title: this.getQwenTtsSaveAudioTitle()
    });

    if (!saveUri) {
      return;
    }

    await fs.mkdir(path.dirname(saveUri.fsPath), { recursive: true });
    await fs.writeFile(saveUri.fsPath, recorded.audioBuffer);

    if (recorded.referenceText.trim()) {
      await ConfigManager.updateProjectConfig('qwenTtsPromptText', recorded.referenceText.trim());
    }

    await this.updateQwenTtsReferenceAudio(saveUri.fsPath);
  }

  private static async selectCosyVoiceReferenceAudio(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: I18n.t('actions.selectReferenceAudio'),
      filters: {
        Media: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v']
      },
      title: this.getCosyVoiceSelectReferenceMediaTitle()
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
        title: this.getCosyVoicePrepareReferenceMediaTitle(),
        cancellable: false
      },
      async () => ReferenceMediaService.resolveReferenceAudioPath(selectedPath)
    );

    await this.updateCosyVoiceReferenceAudio(resolvedAudioPath);

    if (selectedWasVideo) {
      await this.transcribeVideoReferenceAndOpenSettings(resolvedAudioPath);
    }
  }

  private static async selectQwenTtsReferenceAudio(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: this.getQwenTtsSelectReferenceAudioLabel(),
      filters: {
        Media: ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v']
      },
      title: this.getQwenTtsSelectReferenceMediaTitle()
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
        title: this.getQwenTtsPrepareReferenceMediaTitle(),
        cancellable: false
      },
      async () => ReferenceMediaService.resolveReferenceAudioPath(selectedPath)
    );

    await this.updateQwenTtsReferenceAudio(resolvedAudioPath);

    if (selectedWasVideo) {
      await this.transcribeQwenTtsVideoReferenceAndOpenSettings(resolvedAudioPath);
    }
  }

  private static async autoTranscribeCosyVoiceReferenceAudio(): Promise<void> {
    const current = ConfigManager.getCosyVoiceConfig();
    if (!current.promptAudioPath) {
      throw new Error(I18n.t('errors.referenceAudioNotConfigured'));
    }

    const languageChoice = await vscode.window.showQuickPick(
      [
        { label: '中文 (Recommended)', language: 'zh' as const },
        { label: 'Auto Detect', language: 'auto' as const },
        { label: 'English', language: 'en' as const }
      ],
      {
        title: 'CosyVoice',
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
      [
        { label: '中文 (Recommended)', language: 'zh' as const },
        { label: 'Auto Detect', language: 'auto' as const },
        { label: 'English', language: 'en' as const }
      ],
      {
        title: 'Qwen3-TTS + MLX-Audio',
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

  private static async editCosyVoiceReferenceTranscript(): Promise<void> {
    const current = ConfigManager.getCosyVoiceConfig();
    const promptText = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.cosyVoiceReferenceTranscript'),
      value: current.promptText || '',
      placeHolder: I18n.t('config.prompts.cosyVoiceReferenceTranscriptPlaceholder')
    });

    if (promptText === undefined) {
      return;
    }

    await ConfigManager.updateProjectConfig('cosyVoicePromptText', promptText.trim());
    vscode.window.showInformationMessage(I18n.t('notifications.success.referenceTranscriptUpdated', promptText.trim() || I18n.t('settings.no')));
  }

  private static async editQwenTtsReferenceTranscript(): Promise<void> {
    const current = ConfigManager.getQwenTtsConfig();
    const promptText = await vscode.window.showInputBox({
      prompt: this.getQwenTtsReferenceTranscriptPrompt(),
      value: current.promptText || '',
      placeHolder: this.getQwenTtsReferenceTranscriptPlaceholder()
    });

    if (promptText === undefined) {
      return;
    }

    await ConfigManager.updateProjectConfig('qwenTtsPromptText', promptText.trim());
    vscode.window.showInformationMessage(I18n.t('notifications.success.referenceTranscriptUpdated', promptText.trim() || I18n.t('settings.no')));
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
    const current = ConfigManager.getQwenTtsConfig();
    const pythonPath = await vscode.window.showInputBox({
      prompt: this.getQwenTtsPythonPathPrompt(),
      value: current.pythonPath || '',
      placeHolder: '${workspaceFolder}/vendor/Qwen3-TTS/.venv312/bin/python'
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

  private static async updateCosyVoiceReferenceAudio(filePath: string): Promise<void> {
    const storedPath = this.toWorkspaceSettingPath(filePath);
    await ConfigManager.updateProjectConfig('cosyVoicePromptAudioPath', storedPath);

    const autoTranscribeLabel = I18n.t('actions.autoTranscribeReference');
    const revealLabel = I18n.t('actions.showInExplorer');
    const selectedAction = await vscode.window.showInformationMessage(
      I18n.t('notifications.success.referenceAudioUpdated'),
      autoTranscribeLabel,
      revealLabel,
      I18n.t('actions.ok')
    );

    if (selectedAction === autoTranscribeLabel) {
      await this.autoTranscribeCosyVoiceReferenceAudio();
      return;
    }

    if (selectedAction === revealLabel) {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
    }
  }

  private static async updateQwenTtsReferenceAudio(filePath: string): Promise<void> {
    const storedPath = this.toWorkspaceSettingPath(filePath);
    await ConfigManager.updateProjectConfig('qwenTtsPromptAudioPath', storedPath);

    const autoTranscribeLabel = I18n.t('actions.autoTranscribeReference');
    const revealLabel = I18n.t('actions.showInExplorer');
    const selectedAction = await vscode.window.showInformationMessage(
      this.getQwenTtsReferenceAudioUpdatedMessage(),
      autoTranscribeLabel,
      revealLabel,
      I18n.t('actions.ok')
    );

    if (selectedAction === autoTranscribeLabel) {
      await this.autoTranscribeQwenTtsReferenceAudio();
      return;
    }

    if (selectedAction === revealLabel) {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
    }
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

  private static getQwenTtsRecordReferenceAudioLabel(): string {
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

  private static getQwenTtsSelectReferenceAudioLabel(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择参考音频/视频'
      : 'Select Reference Audio / Video';
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

  private static getQwenTtsSelectActionPlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择你要配置的 Qwen3-TTS 本地项'
      : 'Choose what to configure for your local Qwen3-TTS setup';
  }

  private static getQwenTtsSelectTranscriptionLanguagePlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '选择参考音频的转录语言'
      : 'Choose the transcription language for the reference audio';
  }

  private static getQwenTtsReferenceTranscriptPrompt(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '请输入 Qwen3-TTS 参考音频对应的文本'
      : 'Enter the transcript for the Qwen3-TTS reference audio';
  }

  private static getQwenTtsReferenceTranscriptPlaceholder(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '参考音频的文字内容'
      : 'Transcript of the reference audio';
  }

  private static getQwenTtsModelPrompt(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '请输入 Qwen3-TTS 的 MLX 模型 ID 或本地模型路径'
      : 'Enter the Qwen3-TTS MLX model id or local model path';
  }

  private static getQwenTtsPythonPathPrompt(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '请输入运行 MLX-Audio 的 Python 路径'
      : 'Enter the Python path used to run MLX-Audio';
  }

  private static getQwenTtsReferenceAudioUpdatedMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? 'Qwen3-TTS 参考音频已更新。'
      : 'Qwen3-TTS reference audio updated.';
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

    const nextText = upsertSpeechifyWorkspaceSettingsJsonText(currentText, ConfigManager.getWorkspaceConfig());
    if (nextText !== currentText) {
      await fs.writeFile(settingsPath, nextText, 'utf8');
    }
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
