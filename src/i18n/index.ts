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
  'commands.selectRole.title': string;
  'commands.selectRole.description': string;
  'commands.configureAzure.title': string;
  'commands.configureAzure.description': string;
  'commands.convertToVideo.title': string;
  'commands.convertToVideo.description': string;
  'commands.alignmentEditor.title': string;
  'commands.alignmentEditor.description': string;
  'commands.synthesizeVideoFromProject.title': string;
  
  // Notifications
  'notifications.success.speechGenerated': string;
  'notifications.success.speechGeneratedMultiple': string;
  'notifications.success.configUpdated': string;
  'notifications.success.voiceSettingsUpdated': string;
  'notifications.success.azureSettingsUpdated': string;
  'notifications.success.voiceStyleUpdated': string;
  'notifications.success.voiceStyleChanged': string;
  'notifications.success.voiceRoleChanged': string;
  'notifications.success.videoGenerated': string;
  'notifications.success.alignmentSaved': string;
  'notifications.info.noStylesAvailable': string;
  'notifications.info.noRolesAvailable': string;
  
  // Errors
  'errors.noActiveEditor': string;
  'errors.noTextSelected': string;
  'errors.noTextContent': string;
  'errors.configurationIncomplete': string;
  'errors.speechGenerationFailed': string;
  'errors.voiceListNotAvailable': string;
  'errors.voiceListEmpty': string;
  'errors.voiceConfigurationFailed': string;
  'errors.failedToLoadVoiceSettings': string;
  'errors.failedToConfigureVoice': string;
  'errors.failedToConfigureAzure': string;
  'errors.failedToSelectStyle': string;
  'errors.currentVoiceNotFound': string;
  'errors.voiceNoStyles': string;
  'errors.failedToSelectRole': string;
  'errors.invalidCredentials': string;
  'errors.rateLimited': string;
  'errors.invalidRequest': string;
  'errors.networkError': string;
  'errors.fileWriteError': string;
  'errors.fileDeleteError': string;
  'errors.revealError': string;
  'errors.openError': string;
  'errors.ffmpegNotAvailable': string;
  'errors.videoConversionFailed': string;
  'errors.alignmentEditorFailed': string;
  'errors.alignmentEditorCanceled': string;
  'errors.alignmentEditorUnavailable': string;
  'errors.alignmentTimingNotFound': string;
  'errors.visionConfigurationIncomplete': string;
  
  // Configuration
  'config.prompts.subscriptionKey': string;
  'config.prompts.subscriptionKeyPlaceholder': string;
  'config.prompts.region': string;
  'config.prompts.regionPlaceholder': string;
  'config.prompts.selectVoice': string;
  'config.prompts.selectLocale': string;
  'config.prompts.selectLanguage': string;
  'config.prompts.selectGender': string;
  'config.prompts.selectStyle': string;
  'config.prompts.selectRole': string;
  'config.prompts.selectVideoFile': string;
  'config.prompts.selectConversionMode': string;
  'config.prompts.selectAnalysisDepth': string;
  
  // Progress
  'progress.convertingToSpeech': string;
  'progress.convertingToVideo': string;
  'progress.refiningScript': string;
  'progress.analyzingVideo': string;
  'progress.synthesizingAudio': string;
  'progress.processingChunk': string;
  'progress.loadingVoiceList': string;
  'progress.configuringSettings': string;
  'progress.muxingVideo': string;
  'progress.startingSynthesis': string;
  
  // Actions
  'actions.later': string;
  'actions.configureNow': string;
  'actions.showInExplorer': string;
  'actions.openFile': string;
  'actions.configureVoice': string;
  'actions.configureAzure': string;
  'actions.cancel': string;
  'actions.ok': string;
  'actions.retry': string;
  'actions.previewVoice': string;
  'actions.visionAlignment': string;
  'actions.standardConversion': string;
  'actions.refine': string;
  'actions.saveAndRefine': string;
  'actions.resetToAi': string;
  'actions.restoreOriginal': string;
  'actions.restoring': string;
  
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
  'messages.alignmentEditorCanceled': string;
  
  // Alignment Editor
  'alignment.editorTitle': string;
  'alignment.timeline': string;
  'alignment.segments': string;
  'alignment.startTime': string;
  'alignment.currentTime': string;
  'alignment.setToCurrent': string;
  'alignment.segmentTitle': string;
  'alignment.reservedDuration': string;
  'alignment.actualDuration': string;
  'alignment.strategy': string;
  'alignment.strategy.trim': string;
  'alignment.strategy.speed_total': string;
  'alignment.strategy.speed_overflow': string;
  'alignment.strategy.freeze': string;
  'alignment.speedFactor': string;
  
  // Synthesis Modes
  'modes.compact': string;
  'modes.compactDesc': string;
  'modes.original': string;
  'modes.originalDesc': string;
  'modes.custom': string;
  'modes.customDesc': string;
  'prompts.selectSynthesisMode': string;
  
  // Vision Precision
  'vision.precision.high.label': string;
  'vision.precision.high.desc': string;
  'vision.precision.medium.label': string;
  'vision.precision.medium.desc': string;
  'vision.precision.low.label': string;
  'vision.precision.low.desc': string;
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
