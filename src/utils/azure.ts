import axios from 'axios';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { AzureConfig, VoiceSettings, SpeechifyError, WordBoundary } from '../types';

/**
 * Azure Speech Services utilities
 */
export class AzureSpeechService {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Create SSML (Speech Synthesis Markup Language) content
   */
  public static createSSML(text: string, voice: VoiceSettings): string {
    const locale = voice.locale || this.getLocaleFromVoiceName(voice.name);
    
    // Fix common pronunciation issues
    // 1. Fix "AI" read as "爱" (ài) in Chinese locales by adding a space between letters
    // We use word boundaries (\b) to ensure we only catch standalone "AI" and not "MAIN", "AID", etc.
    const processedText = text.replace(/\bAI\b/g, 'A I');

    return `<speak version='1.0' xml:lang='${locale}'>
                <voice xml:lang='${locale}' xml:gender='${voice.gender}' name='${voice.name}' style='${voice.style}'>
                    ${this.escapeXml(processedText)}
                </voice>
            </speak>`;
  }

  /**
   * Get locale from voice name
   */
  private static getLocaleFromVoiceName(voiceName: string): string {
    const localeMatch = voiceName.match(/^([a-z]{2}-[A-Z]{2})/);
    return localeMatch?.[1] ?? 'en-US';
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get authentication token from Azure
   */
  public static async getAuthToken(config: AzureConfig): Promise<string> {
    const tokenUrl = `https://${config.region || 'eastus'}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    
    try {
      const response = await axios.post(
        tokenUrl,
        null,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': config.subscriptionKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: this.DEFAULT_TIMEOUT
        }
      );

      return response.data;
    } catch (error) {
      throw this.createError('AUTH_FAILED', 'Failed to get authentication token', error);
    }
  }

  /**
   * Synthesize speech with retry mechanism
   */
  public static async synthesizeSpeech(
    text: string,
    voice: VoiceSettings,
    config: AzureConfig
  ): Promise<Buffer> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.synthesizeSpeechAttempt(text, voice, config);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.MAX_RETRIES) {
          console.log(`Speech synthesis attempt ${attempt} failed, retrying...`);
          await this.delay(this.RETRY_DELAY * attempt);
        }
      }
    }

    throw this.createError('SYNTHESIS_FAILED', 'Speech synthesis failed after retries', lastError);
  }

  /**
   * Single speech synthesis attempt
   */
  private static async synthesizeSpeechAttempt(
    text: string,
    voice: VoiceSettings,
    config: AzureConfig
  ): Promise<Buffer> {
    const ssml = this.createSSML(text, voice);
    
    try {
      const response = await axios.post(
        config.endpoint,
        ssml,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': config.subscriptionKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
            'User-Agent': 'Speechify-VSCode-Extension'
          },
          responseType: 'arraybuffer',
          timeout: this.DEFAULT_TIMEOUT
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        
        if (status === 401) {
          throw this.createError('INVALID_CREDENTIALS', 'Invalid Azure credentials');
        } else if (status === 429) {
          throw this.createError('RATE_LIMITED', 'Rate limit exceeded');
        } else if (status === 400) {
          throw this.createError('INVALID_REQUEST', 'Invalid request parameters');
        }
        
        throw this.createError('HTTP_ERROR', `HTTP ${status}: ${statusText}`, error);
      }
      
      throw this.createError('NETWORK_ERROR', 'Network error during synthesis', error);
    }
  }

  /**
   * Synthesize speech and return word boundaries using SDK
   */
  public static async synthesizeWithBoundaries(
    text: string,
    voice: VoiceSettings,
    config: AzureConfig
  ): Promise<{ audioBuffer: Buffer; boundaries: WordBoundary[] }> {
    console.log(`Starting synthesis with boundaries for text: "${text.substring(0, 50)}"`);
    const region = config.region || 'eastus';
    
    // Get token first for more robust auth
    const token = await this.getAuthToken(config);
    console.log(`Got auth token for region: ${region}`);
    
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechSynthesisVoiceName = voice.name;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3;

    // Use pull stream to avoid audio device issues
    const pcmStream = sdk.AudioOutputStream.createPullStream();
    const audioConfig = sdk.AudioConfig.fromStreamOutput(pcmStream);
    
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
    const boundaries: WordBoundary[] = [];

    synthesizer.wordBoundary = (_s, e): void => {
      boundaries.push({
        text: e.text,
        audioOffset: e.audioOffset / 10000, // Convert ticks to milliseconds
        duration: e.duration / 10000
      });
    };

    const ssml = this.createSSML(text, voice);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        synthesizer.close();
        reject(new Error('Speech synthesis timed out after 60 seconds'));
      }, 60000);

      console.log('Calling speakSsmlAsync...');
      synthesizer.speakSsmlAsync(
        ssml,
        result => {
          clearTimeout(timeout);
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            console.log(`Synthesis completed. Got ${result.audioData.byteLength} bytes and ${boundaries.length} boundaries.`);
            resolve({
              audioBuffer: Buffer.from(result.audioData),
              boundaries: boundaries
            });
          } else {
            console.error('Synthesis failed:', result.errorDetails);
            reject(new Error(`Synthesis failed: ${result.errorDetails}`));
          }
          synthesizer.close();
        },
        err => {
          clearTimeout(timeout);
          console.error('Speech SDK error:', err);
          reject(err);
          synthesizer.close();
        }
      );
    });
  }

  /**
   * Split text into chunks to avoid size limits
   */
  public static splitTextIntoChunks(text: string, maxChunkSize: number = 8000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;
      
      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks;
  }

  /**
   * Extract text from markdown content
   */
  public static extractTextFromMarkdown(markdown: string): string {
    // Remove code blocks
    const noCodeBlocks = markdown.replace(/```[\s\S]*?```/g, '');
    
    // Remove inline code (commented out as per original)
    // const noInlineCode = noCodeBlocks.replace(/`([^`]+)`/g, '');
    
    // Remove markdown headers
    const noHeaders = noCodeBlocks.replace(/^#{1,6}\s+/gm, '');
    
    // Remove markdown formatting
    const noFormatting = noHeaders
      .replace(/\*\*(.*?)\*\*/g, '$1') // bold
      .replace(/\*(.*?)\*/g, '$1') // italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // links
      .replace(/^\s*[-*+]\s+/gm, '') // bullet points
      .replace(/^\s*\d+\.\s+/gm, ''); // numbered lists
    
    return noFormatting.trim();
  }

  /**
   * Delay utility for retries
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create structured error
   */
  private static createError(code: string, message: string, details?: unknown): SpeechifyError {
    return {
      code,
      message,
      details
    };
  }
}
