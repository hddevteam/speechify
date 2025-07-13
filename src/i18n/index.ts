/**
 * Internationalization message interface
 */
export interface Messages {
  // Commands
  'commands.speechify.title': string;
  'commands.speechify.description': string;
  'commands.voiceSettings.title': string;
  'commands.voiceSettings.description': string;
  'commands.configureVoice.title': string;
  'commands.configureVoice.description': string;
  'commands.configureAzure.title': string;
  'commands.configureAzure.description': string;
  
  // Notifications
  'notifications.success.speechGenerated': string;
  'notifications.success.speechGeneratedMultiple': string;
  'notifications.success.configUpdated': string;
  'notifications.success.voiceSettingsUpdated': string;
  'notifications.success.azureSettingsUpdated': string;
  
  // Errors
  'errors.noActiveEditor': string;
  'errors.noTextSelected': string;
  'errors.noTextContent': string;
  'errors.configurationIncomplete': string;
  'errors.speechGenerationFailed': string;
  'errors.voiceListNotAvailable': string;
  'errors.failedToLoadVoiceSettings': string;
  'errors.failedToConfigureVoice': string;
  'errors.failedToConfigureAzure': string;
  'errors.invalidCredentials': string;
  'errors.rateLimited': string;
  'errors.invalidRequest': string;
  'errors.networkError': string;
  'errors.fileWriteError': string;
  'errors.fileDeleteError': string;
  'errors.revealError': string;
  'errors.openError': string;
  
  // Configuration
  'config.prompts.subscriptionKey': string;
  'config.prompts.subscriptionKeyPlaceholder': string;
  'config.prompts.region': string;
  'config.prompts.regionPlaceholder': string;
  'config.prompts.selectVoice': string;
  'config.prompts.selectLocale': string;
  'config.prompts.selectGender': string;
  'config.prompts.selectStyle': string;
  
  // Progress
  'progress.convertingToSpeech': string;
  'progress.processingChunk': string;
  'progress.loadingVoiceList': string;
  'progress.configuringSettings': string;
  
  // Actions
  'actions.configureNow': string;
  'actions.later': string;
  'actions.showInExplorer': string;
  'actions.openFile': string;
  'actions.configureVoice': string;
  'actions.configureAzure': string;
  'actions.cancel': string;
  'actions.ok': string;
  'actions.retry': string;
  
  // Settings
  'settings.voiceName': string;
  'settings.voiceGender': string;
  'settings.voiceStyle': string;
  'settings.region': string;
  'settings.hasApiKey': string;
  'settings.current': string;
  'settings.yes': string;
  'settings.no': string;
  
  // Voice attributes
  'voice.male': string;
  'voice.female': string;
  'voice.neutral': string;
  'voice.styles.friendly': string;
  'voice.styles.cheerful': string;
  'voice.styles.excited': string;
  'voice.styles.hopeful': string;
  'voice.styles.sad': string;
  'voice.styles.angry': string;
  'voice.styles.fearful': string;
  'voice.styles.disgruntled': string;
  'voice.styles.serious': string;
  'voice.styles.affectionate': string;
  'voice.styles.gentle': string;
  'voice.styles.calm': string;
  
  // Messages
  'messages.configurationRequired': string;
  'messages.azureConfigurationRequired': string;
  'messages.azureCredentialsConfigured': string;
  'messages.currentSettings': string;
  'messages.processingComplete': string;
  'messages.audioFilesSaved': string;
  'messages.extensionActivated': string;
  'messages.extensionDeactivated': string;
}

/**
 * Internationalization manager
 */
export class I18n {
  private static instance: I18n;
  private messages: Messages;
  private currentLocale: string;

  private constructor() {
    this.currentLocale = this.detectLocale();
    this.messages = this.loadMessages(this.currentLocale);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): I18n {
    if (!I18n.instance) {
      I18n.instance = new I18n();
    }
    return I18n.instance;
  }

  /**
   * Get translated message
   */
  public static t(key: keyof Messages, ...args: string[]): string {
    return I18n.getInstance().translate(key, ...args);
  }

  /**
   * Get current locale
   */
  public static getLocale(): string {
    return I18n.getInstance().currentLocale;
  }

  /**
   * Translate message
   */
  public translate(key: keyof Messages, ...args: string[]): string {
    // Handle null, undefined, or invalid keys
    if (key === null || key === undefined || typeof key !== 'string') {
      return `[Invalid key: ${key}]`;
    }
    
    let message = this.messages[key] || key;
    
    // Simple interpolation
    if (args.length > 0) {
      args.forEach((arg, index) => {
        message = message.replace(`{${index}}`, String(arg));
      });
    }
    
    return message;
  }

  /**
   * Detect user locale
   */
  private detectLocale(): string {
    // In VS Code environment, check for VSCODE_NLS_CONFIG
    if (typeof process !== 'undefined' && process.env.VSCODE_NLS_CONFIG) {
      try {
        const nlsConfig = JSON.parse(process.env.VSCODE_NLS_CONFIG);
        const locale = nlsConfig.locale || 'en';
        
        // Check for Chinese variants
        if (locale.startsWith('zh')) {
          return 'zh-cn';
        }
        
        return 'en';
      } catch (e) {
        // Fallback to environment variables
      }
    }

    // Check environment variables
    const locale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || 'en';
    if (locale.startsWith('zh')) {
      return 'zh-cn';
    }

    return 'en';
  }

  /**
   * Load messages for locale
   */
  private loadMessages(locale: string): Messages {
    try {
      if (locale.startsWith('zh')) {
        return require('./zh-cn').default;
      }
      return require('./en').default;
    } catch (e) {
      console.warn(`Failed to load messages for locale ${locale}, falling back to English`);
      return require('./en').default;
    }
  }

  /**
   * Switch locale (for testing)
   */
  public switchLocale(locale: string): void {
    this.currentLocale = locale;
    this.messages = this.loadMessages(locale);
  }
}

export default I18n;
