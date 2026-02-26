/**
 * Azure Speech Services related types
 */
export interface AzureConfig {
  subscriptionKey: string;
  endpoint: string;
  region?: string;
}

export interface VoiceSettings {
  name: string;
  gender: string;
  style: string;
  locale?: string;
  role?: string;  // Optional role for roleplay voices
}

export interface VoiceListItem {
  Name: string;
  DisplayName: string;
  LocalName: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  LocaleName: string;
  SampleRateHertz: string;
  VoiceType: string;
  Status: string;
  WordsPerMinute: string;
  StyleList?: string[];  // Optional array of available styles
  SecondaryLocaleList?: string[];  // Optional array of secondary locales
  RolePlayList?: string[];  // Optional array of roleplay options
}

/**
 * Extension configuration types
 */
export interface SpeechifyConfig {
  azureSpeechServicesKey: string;
  speechServicesRegion: string;
  voiceName: string;
  voiceGender: string;
  voiceStyle: string;
  voiceRole?: string;  // Optional role for roleplay voices
  enableTransitions?: boolean;
  transitionType?: string;
  autoTrimVideo?: boolean;
  visionApiKey?: string;
  visionEndpoint?: string;
  visionDeployment?: string;
  refinementDeployment?: string;
}

/**
 * Test configuration types
 */
export interface TestConfig {
  subscriptionKey: string;
  endpoint: string;
  vision?: {
    apiKey: string;
    endpoint: string;
    deployment: string;
    refinementDeployment?: string;
  };
}

/**
 * Speech synthesis request types
 */
export interface SpeechRequest {
  text: string;
  voice: VoiceSettings;
  config: AzureConfig;
  outputPath: string;
}

export interface SpeechResponse {
  success: boolean;
  audioPath?: string;
  error?: string;
  duration?: number;
}

/**
 * File processing types
 */
export interface TextChunk {
  text: string;
  index: number;
  outputPath: string;
}

export interface ProcessingResult {
  success: boolean;
  processedChunks: number;
  totalChunks: number;
  outputPaths: string[];
  errors: string[];
  wordBoundaries?: WordBoundary[]; // Word timing information
}

export interface WordBoundary {
  text: string;
  audioOffset: number; // In milliseconds
  duration: number; // In milliseconds
}

export interface VideoProcessingResult extends ProcessingResult {
  videoOutputPath?: string;
}

/**
 * Error types
 */
export interface SpeechifyError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Constants
 */
export const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'ogg'] as const;
export type AudioFormat = typeof SUPPORTED_AUDIO_FORMATS[number];

export const VOICE_GENDERS = ['Male', 'Female', 'Neutral'] as const;
export type VoiceGender = typeof VOICE_GENDERS[number];

export const VOICE_STYLES = [
  'friendly',
  'cheerful',
  'excited',
  'hopeful',
  'sad',
  'angry',
  'fearful',
  'disgruntled',
  'serious',
  'affectionate',
  'gentle',
  'calm'
] as const;
export type VoiceStyle = typeof VOICE_STYLES[number];
