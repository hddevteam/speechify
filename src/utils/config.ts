import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AzureConfig, CosyVoiceConfig, SpeechProviderType, SpeechifyConfig, TestConfig, VoiceSettings } from '../types';
import { getSpeechifyPrimaryRelativeKey, readSpeechifySettingValue } from './speechifySettings';

export interface VisionConfigValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface VisionConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  refinementDeployment: string;
}

/**
 * Configuration manager for Speechify extension
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = 'speechify';
  private static readonly TEST_CONFIG_FILE = 'test-config.json';
  private static readonly AZURE_OPENAI_HOST_SUFFIX = 'openai.azure.com';

  /**
   * Get VS Code workspace configuration
   */
  public static getWorkspaceConfig(): SpeechifyConfig {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    
    return {
      speechProvider: readSpeechifySettingValue<SpeechProviderType>(config, 'speechProvider', 'azure'),
      azureSpeechServicesKey: readSpeechifySettingValue<string>(config, 'azureSpeechServicesKey', ''),
      speechServicesRegion: readSpeechifySettingValue<string>(config, 'speechServicesRegion', 'eastus'),
      voiceName: readSpeechifySettingValue<string>(config, 'voiceName', 'zh-CN-YunyangNeural'),
      voiceGender: readSpeechifySettingValue<string>(config, 'voiceGender', 'Male'),
      voiceStyle: readSpeechifySettingValue<string>(config, 'voiceStyle', 'friendly'),
      voiceRole: readSpeechifySettingValue<string>(config, 'voiceRole', ''),
      cosyVoiceBaseUrl: readSpeechifySettingValue<string>(config, 'cosyVoiceBaseUrl', 'http://127.0.0.1:50000'),
      cosyVoicePythonPath: readSpeechifySettingValue<string>(config, 'cosyVoicePythonPath', ''),
      cosyVoicePromptAudioPath: readSpeechifySettingValue<string>(config, 'cosyVoicePromptAudioPath', ''),
      cosyVoicePromptText: readSpeechifySettingValue<string>(config, 'cosyVoicePromptText', ''),
      cosyVoiceRequestTimeoutSeconds: readSpeechifySettingValue<number>(config, 'cosyVoiceRequestTimeoutSeconds', 300),
      visionApiKey: readSpeechifySettingValue<string>(config, 'visionApiKey', ''),
      visionEndpoint: readSpeechifySettingValue<string>(config, 'visionEndpoint', ''),
      visionDeployment: readSpeechifySettingValue<string>(config, 'visionDeployment', 'gpt-5.2'),
      refinementDeployment: readSpeechifySettingValue<string>(config, 'refinementDeployment', 'gpt-5.2'),
      enableTransitions: readSpeechifySettingValue<boolean>(config, 'enableTransitions', true),
      transitionType: readSpeechifySettingValue<string>(config, 'transitionType', 'fade'),
      autoTrimVideo: readSpeechifySettingValue<boolean>(config, 'autoTrimVideo', true)
    };
  }

  /**
   * Update VS Code workspace configuration
   */
  public static async updateWorkspaceConfig<K extends keyof SpeechifyConfig>(
    key: K,
    value: SpeechifyConfig[K]
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(getSpeechifyPrimaryRelativeKey(key), value, vscode.ConfigurationTarget.Global);
  }

  public static async updateProjectConfig<K extends keyof SpeechifyConfig>(
    key: K,
    value: SpeechifyConfig[K]
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    const target = vscode.workspace.workspaceFolders?.length ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await config.update(getSpeechifyPrimaryRelativeKey(key), value, target);
  }

  public static getSpeechProvider(providerOverride?: SpeechProviderType): SpeechProviderType {
    return providerOverride || this.getWorkspaceConfig().speechProvider || 'azure';
  }

  /**
   * Get voice settings from configuration
   */
  public static getVoiceSettings(providerOverride?: SpeechProviderType): VoiceSettings {
    const config = this.getWorkspaceConfig();

    if (this.getSpeechProvider(providerOverride) === 'cosyvoice') {
      const promptPath = config.cosyVoicePromptAudioPath || '';
      const inferredName = promptPath ? path.basename(promptPath, path.extname(promptPath)) : 'CosyVoice Clone';
      return {
        name: inferredName,
        gender: 'Neutral',
        style: 'general',
        locale: 'zh-CN'
      };
    }

    const settings: VoiceSettings = {
      name: config.voiceName,
      gender: config.voiceGender,
      style: config.voiceStyle,
      locale: 'zh-CN'
    };

    // Only add role if it's set
    if (config.voiceRole) {
      settings.role = config.voiceRole;
    }

    return settings;
  }

  /**
   * Get Azure configuration from workspace settings
   */
  public static getAzureConfig(): AzureConfig {
    const config = this.getWorkspaceConfig();
    
    return {
      subscriptionKey: config.azureSpeechServicesKey,
      endpoint: `https://${config.speechServicesRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      region: config.speechServicesRegion
    };
  }

  public static getCosyVoiceConfig(): CosyVoiceConfig {
    const config = this.getWorkspaceConfig();
    const promptAudioPath = this.resolveWorkspacePath((config.cosyVoicePromptAudioPath || '').trim());
    return {
      baseUrl: (config.cosyVoiceBaseUrl || '').trim(),
      pythonPath: this.resolveWorkspacePath((config.cosyVoicePythonPath || '').trim()),
      promptAudioPath,
      promptText: (config.cosyVoicePromptText || '').trim(),
      requestTimeoutSeconds: this.normalizeCosyVoiceRequestTimeoutSeconds(config.cosyVoiceRequestTimeoutSeconds)
    };
  }

  private static normalizeCosyVoiceRequestTimeoutSeconds(value: number | undefined): number {
    const normalized = Number.isFinite(value) ? Math.round(value as number) : 300;
    return Math.max(30, normalized);
  }

  private static resolveWorkspacePath(inputPath: string): string {
    if (!inputPath) {
      return '';
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return inputPath;
    }

    const expandedPath = inputPath.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
    if (path.isAbsolute(expandedPath)) {
      return expandedPath;
    }

    return path.resolve(workspaceRoot, expandedPath);
  }

  /**
   * Get Vision configuration
   */
  public static getVisionConfig(): VisionConfig {
    const config = this.getWorkspaceConfig();
    
    if (config.visionApiKey) {
        return {
          apiKey: config.visionApiKey,
          endpoint: this.normalizeVisionEndpoint(config.visionEndpoint || ''),
          deployment: config.visionDeployment || 'gpt-5.2',
          refinementDeployment: config.refinementDeployment || 'gpt-5.2'
        };
    }

    const testConfig = this.loadTestConfig();
    if (testConfig?.vision) {
        return {
            ...testConfig.vision,
        endpoint: this.normalizeVisionEndpoint(testConfig.vision.endpoint),
            refinementDeployment: testConfig.vision.refinementDeployment || testConfig.vision.deployment
        };
    }

    return {
      apiKey: '',
      endpoint: '',
      deployment: 'gpt-5.2',
      refinementDeployment: 'gpt-5.2'
    };
  }

  /**
   * Normalize Azure OpenAI endpoint to origin format.
   * Example: https://my-resource.openai.azure.com/
   */
  public static normalizeVisionEndpoint(endpoint: string): string {
    const trimmed = (endpoint || '').trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = new URL(trimmed);
      return parsed.origin;
    } catch {
      return trimmed.replace(/\/+$/, '');
    }
  }

  /**
   * Validate vision settings for Azure OpenAI based workflows.
   */
  public static validateVisionSettings(config: {
    apiKey?: string;
    endpoint?: string;
    deployment?: string;
    refinementDeployment?: string;
  }): VisionConfigValidationResult {
    const errors: string[] = [];
    const endpoint = (config.endpoint || '').trim();
    const deployment = (config.deployment || '').trim();
    const refinementDeployment = (config.refinementDeployment || '').trim();

    if (!(config.apiKey || '').trim()) {
      errors.push('missingApiKey');
    }

    if (!endpoint) {
      errors.push('missingEndpoint');
    } else {
      if (!/^https:\/\//i.test(endpoint)) {
        errors.push('invalidEndpointProtocol');
      }

      try {
        const parsed = new URL(endpoint);
        if (!parsed.hostname.endsWith(this.AZURE_OPENAI_HOST_SUFFIX)) {
          errors.push('invalidEndpointHost');
        }
      } catch {
        errors.push('invalidEndpointFormat');
      }
    }

    if (!deployment) {
      errors.push('missingVisionDeployment');
    }

    if (!refinementDeployment) {
      errors.push('missingRefinementDeployment');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Load test configuration for development
   */
  public static loadTestConfig(): TestConfig | null {
    try {
      const testConfigPath = path.join(process.cwd(), this.TEST_CONFIG_FILE);
      
      if (!fs.existsSync(testConfigPath)) {
        return null;
      }

      const configData = fs.readFileSync(testConfigPath, 'utf-8');
      const config = JSON.parse(configData) as TestConfig;
      
      return config;
    } catch (error) {
      console.error('Failed to load test configuration:', error);
      return null;
    }
  }

  /**
   * Get Azure configuration for testing (falls back to test config)
   */
  public static getAzureConfigForTesting(): AzureConfig {
    const workspaceConfig = this.getAzureConfig();
    
    // If workspace config has credentials, use them
    if (workspaceConfig.subscriptionKey) {
      return workspaceConfig;
    }

    // Otherwise, try to load test config
    const testConfig = this.loadTestConfig();
    if (testConfig) {
      // Extract region from endpoint if not provided
      let region = 'eastus';
      if (testConfig.endpoint) {
        // Handle both https://region.api.cognitive.microsoft.com and https://region.tts.speech.microsoft.com
        const match = testConfig.endpoint.match(/https:\/\/([^.]+)\.(api|tts)\./);
        if (match && match[1]) {
          region = match[1];
        }
      }

      return {
        subscriptionKey: testConfig.subscriptionKey,
        endpoint: testConfig.endpoint.includes('/cognitiveservices/v1') 
          ? testConfig.endpoint 
          : testConfig.endpoint.endsWith('/') 
            ? `${testConfig.endpoint}cognitiveservices/v1`
            : `${testConfig.endpoint}/cognitiveservices/v1`,
        region: region
      };
    }

    // Return empty config if neither is available
    return {
      subscriptionKey: '',
      endpoint: ''
    };
  }

  /**
   * Validate configuration
   */
  public static validateAzureConfig(config: AzureConfig): boolean {
    return !!(config.subscriptionKey && config.endpoint);
  }

  public static validateConfig(config: AzureConfig): boolean {
    return this.validateAzureConfig(config);
  }

  public static validateCosyVoiceConfig(config: CosyVoiceConfig): boolean {
    return !!(config.baseUrl && config.promptAudioPath);
  }

  /**
   * Check if configuration is complete
   */
  public static isConfigurationComplete(providerOverride?: SpeechProviderType): boolean {
    if (this.getSpeechProvider(providerOverride) === 'cosyvoice') {
      return this.validateCosyVoiceConfig(this.getCosyVoiceConfig());
    }

    const config = this.getAzureConfigForTesting();
    return this.validateAzureConfig(config);
  }

  /**
   * Reset configuration to defaults
   */
  public static async resetConfiguration(): Promise<void> {
    await this.updateWorkspaceConfig('speechProvider', 'azure');
    await this.updateWorkspaceConfig('azureSpeechServicesKey', '');
    await this.updateWorkspaceConfig('speechServicesRegion', 'eastus');
    await this.updateWorkspaceConfig('voiceName', 'zh-CN-YunyangNeural');
    await this.updateWorkspaceConfig('voiceGender', 'Male');
    await this.updateWorkspaceConfig('voiceStyle', 'friendly');
    await this.updateWorkspaceConfig('voiceRole', '');
    await this.updateWorkspaceConfig('cosyVoiceBaseUrl', 'http://127.0.0.1:50000');
    await this.updateWorkspaceConfig('cosyVoicePythonPath', '');
    await this.updateWorkspaceConfig('cosyVoicePromptAudioPath', '');
    await this.updateWorkspaceConfig('cosyVoicePromptText', '');
    await this.updateWorkspaceConfig('cosyVoiceRequestTimeoutSeconds', 300);
    await this.updateWorkspaceConfig('visionApiKey', '');
    await this.updateWorkspaceConfig('visionEndpoint', '');
    await this.updateWorkspaceConfig('visionDeployment', 'gpt-5.2');
    await this.updateWorkspaceConfig('refinementDeployment', 'gpt-5.2');
  }
}
