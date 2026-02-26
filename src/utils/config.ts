import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SpeechifyConfig, VoiceSettings, AzureConfig, TestConfig } from '../types';

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
      azureSpeechServicesKey: config.get<string>('azureSpeechServicesKey', ''),
      speechServicesRegion: config.get<string>('speechServicesRegion', 'eastus'),
      voiceName: config.get<string>('voiceName', 'zh-CN-YunyangNeural'),
      voiceGender: config.get<string>('voiceGender', 'Male'),
      voiceStyle: config.get<string>('voiceStyle', 'friendly'),
      voiceRole: config.get<string>('voiceRole', ''),
      visionApiKey: config.get<string>('visionApiKey', ''),
      visionEndpoint: config.get<string>('visionEndpoint', ''),
      visionDeployment: config.get<string>('visionDeployment', 'gpt-5.2'),
      refinementDeployment: config.get<string>('refinementDeployment', 'gpt-5.2'),
      enableTransitions: config.get<boolean>('enableTransitions', true),
      transitionType: config.get<string>('transitionType', 'fade'),
      autoTrimVideo: config.get<boolean>('autoTrimVideo', true)
    };
  }

  /**
   * Update VS Code workspace configuration
   */
  public static async updateWorkspaceConfig(key: keyof SpeechifyConfig, value: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get voice settings from configuration
   */
  public static getVoiceSettings(): VoiceSettings {
    const config = this.getWorkspaceConfig();
    
    const settings: VoiceSettings = {
      name: config.voiceName,
      gender: config.voiceGender,
      style: config.voiceStyle,
      locale: 'zh-CN' // Extract locale from voice name or use default
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
  public static validateConfig(config: AzureConfig): boolean {
    return !!(config.subscriptionKey && config.endpoint);
  }

  /**
   * Check if configuration is complete
   */
  public static isConfigurationComplete(): boolean {
    const config = this.getAzureConfigForTesting();
    return this.validateConfig(config);
  }

  /**
   * Reset configuration to defaults
   */
  public static async resetConfiguration(): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    
    await config.update('azureSpeechServicesKey', '', vscode.ConfigurationTarget.Global);
    await config.update('speechServicesRegion', 'eastus', vscode.ConfigurationTarget.Global);
    await config.update('voiceName', 'zh-CN-YunyangNeural', vscode.ConfigurationTarget.Global);
    await config.update('voiceGender', 'Male', vscode.ConfigurationTarget.Global);
    await config.update('voiceStyle', 'friendly', vscode.ConfigurationTarget.Global);
  }
}
