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
}

export interface VoiceListItem {
  name: string;
  gender: string;
  style: string;
  locale: string;
  displayName?: string;
  description?: string;
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
}

/**
 * Test configuration types
 */
export interface TestConfig {
  subscriptionKey: string;
  endpoint: string;
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
}

/**
 * Error types
 */
export interface SpeechifyError {
  code: string;
  message: string;
  details?: any;
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
