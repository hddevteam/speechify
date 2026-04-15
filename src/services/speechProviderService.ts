import * as fs from 'fs';
import * as path from 'path';
import { AzureSpeechService } from '../utils/azure';
import { ConfigManager } from '../utils/config';
import {
  AudioFormat,
  CosyVoiceConfig,
  SpeechProviderType,
  SpeechSynthesisResult,
  VoiceListItem,
  VoiceSettings
} from '../types';
import { SpeechTextUtils } from '../utils/speechText';
import { pcm16MonoToWavBuffer } from '../utils/wav';

interface CosyVoiceRuntimeGlobals {
  FormData?: {
    new (): {
      set(name: string, value: unknown, fileName?: string): void;
    };
  };
  Blob?: {
    new (parts?: Array<Buffer | Uint8Array>, options?: { type?: string }): unknown;
  };
  fetch?: (
    input: string,
    init?: { method?: string; body?: unknown }
  ) => Promise<{ ok: boolean; status: number; statusText: string; arrayBuffer(): Promise<ArrayBuffer> }>;
}

export class SpeechProviderService {
  private static readonly COSYVOICE_SAMPLE_RATE = 22050;

  public static getActiveProvider(): SpeechProviderType {
    return ConfigManager.getSpeechProvider();
  }

  public static extractTextFromMarkdown(markdown: string): string {
    return SpeechTextUtils.extractTextFromMarkdown(markdown);
  }

  public static splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    return SpeechTextUtils.splitTextIntoChunks(text, maxChunkSize);
  }

  public static getPreferredOutputFormat(): AudioFormat {
    return this.getActiveProvider() === 'cosyvoice' ? 'wav' : 'mp3';
  }

  public static supportsVoiceCatalog(): boolean {
    return this.getActiveProvider() === 'azure';
  }

  public static getVoiceList(): VoiceListItem[] {
    if (!this.supportsVoiceCatalog()) {
      return [];
    }

    return [];
  }

  public static createDebugArtifact(text: string, voice: VoiceSettings): { extension: 'ssml' | 'txt'; content: string } {
    if (this.getActiveProvider() === 'cosyvoice') {
      return {
        extension: 'txt',
        content: text
      };
    }

    return {
      extension: 'ssml',
      content: AzureSpeechService.createSSML(text, voice)
    };
  }

  public static async synthesizeSpeech(text: string, voice: VoiceSettings): Promise<{ audioBuffer: Buffer; audioFormat: AudioFormat }> {
    if (this.getActiveProvider() === 'cosyvoice') {
      const result = await this.synthesizeWithMetadata(text, voice);
      return {
        audioBuffer: result.audioBuffer,
        audioFormat: result.audioFormat
      };
    }

    const azureConfig = ConfigManager.getAzureConfigForTesting();
    const audioBuffer = await AzureSpeechService.synthesizeSpeech(text, voice, azureConfig);
    return {
      audioBuffer,
      audioFormat: 'mp3'
    };
  }

  public static async synthesizeWithMetadata(text: string, voice: VoiceSettings): Promise<SpeechSynthesisResult> {
    if (this.getActiveProvider() === 'cosyvoice') {
      return this.synthesizeWithCosyVoice(text);
    }

    const azureConfig = ConfigManager.getAzureConfigForTesting();
    const { audioBuffer, boundaries } = await AzureSpeechService.synthesizeWithBoundaries(text, voice, azureConfig);
    const lastBoundary = boundaries[boundaries.length - 1];
    const durationMs = lastBoundary ? lastBoundary.audioOffset + (lastBoundary.duration || 0) : 0;

    return {
      audioBuffer,
      audioFormat: 'mp3',
      boundaries,
      durationMs,
      debugArtifactExtension: 'ssml',
      debugArtifactContent: AzureSpeechService.createSSML(text, voice)
    };
  }

  private static async synthesizeWithCosyVoice(text: string): Promise<SpeechSynthesisResult> {
    const config = ConfigManager.getCosyVoiceConfig();
    this.validateCosyVoiceConfig(config);

    const promptAudio = fs.readFileSync(config.promptAudioPath);
    const runtimeGlobals = global as unknown as CosyVoiceRuntimeGlobals;
    const FormDataCtor = runtimeGlobals.FormData;
    const BlobCtor = runtimeGlobals.Blob;
    const fetchImpl = runtimeGlobals.fetch;

    if (!FormDataCtor || !BlobCtor || !fetchImpl) {
      throw new Error('Current Node.js runtime does not provide fetch/FormData/Blob required for CosyVoice requests.');
    }

    const formData = new FormDataCtor();
    formData.set('tts_text', text);
    formData.set(
      'prompt_wav',
      new BlobCtor([promptAudio], { type: 'audio/wav' }),
      path.basename(config.promptAudioPath)
    );

    const hasPromptText = Boolean(config.promptText?.trim());
    if (hasPromptText) {
      const promptText = config.promptText?.trim();
      if (promptText) {
        formData.set('prompt_text', promptText);
      }
    }

    const endpoint = `${this.normalizeBaseUrl(config.baseUrl)}/${hasPromptText ? 'inference_zero_shot' : 'inference_cross_lingual'}`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`CosyVoice request failed with ${response.status} ${response.statusText}`);
    }

    const pcmBuffer = Buffer.from(await response.arrayBuffer());
    const wavBuffer = pcm16MonoToWavBuffer(pcmBuffer, {
      sampleRate: this.COSYVOICE_SAMPLE_RATE,
      channels: 1
    });

    const durationMs = Math.round((pcmBuffer.length / 2 / this.COSYVOICE_SAMPLE_RATE) * 1000);
    const boundaries = SpeechTextUtils.approximateBoundaries(text, durationMs);

    return {
      audioBuffer: wavBuffer,
      audioFormat: 'wav',
      boundaries,
      durationMs,
      debugArtifactExtension: 'txt',
      debugArtifactContent: text
    };
  }

  private static validateCosyVoiceConfig(config: CosyVoiceConfig): void {
    if (!config.baseUrl.trim()) {
      throw new Error('CosyVoice base URL is not configured.');
    }

    if (!config.promptAudioPath.trim()) {
      throw new Error('CosyVoice reference audio path is not configured.');
    }

    if (!fs.existsSync(config.promptAudioPath)) {
      throw new Error(`CosyVoice reference audio file not found: ${config.promptAudioPath}`);
    }
  }

  private static normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
  }
}
