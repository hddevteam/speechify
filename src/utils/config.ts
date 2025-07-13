import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SpeechifyConfig, VoiceSettings, AzureConfig, TestConfig } from '../types';

/**
 * Configuration manager for Speechify extension
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = 'speechify';
  private static readonly TEST_CONFIG_FILE = 'test-config.json';

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
      voiceStyle: config.get<string>('voiceStyle', 'friendly')
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
    
    return {
      name: config.voiceName,
      gender: config.voiceGender,
      style: config.voiceStyle
    };
  }

  /**
   * Get Azure configuration from workspace settings
   */
  public static getAzureConfig(): AzureConfig {
    const config = this.getWorkspaceConfig();
    
    return {
      subscriptionKey: config.azureSpeechServicesKey,
      endpoint: `https://${config.speechServicesRegion}.tts.speech.microsoft.com`,
      region: config.speechServicesRegion
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
      return {
        subscriptionKey: testConfig.subscriptionKey,
        endpoint: testConfig.endpoint
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
