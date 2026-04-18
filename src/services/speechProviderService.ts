import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AzureSpeechService } from '../utils/azure';
import { ConfigManager } from '../utils/config';
import {
  AudioFormat,
  CosyVoiceConfig,
  SpeechExecutionOptions,
  SpeechProviderType,
  SpeechSynthesisResult,
  VoiceListItem,
  VoiceSettings
} from '../types';
import { SpeechTextUtils } from '../utils/speechText';
import { pcm16MonoToWavBuffer } from '../utils/wav';
import { QwenTtsService } from './qwenTtsService';
import { ReferenceMediaService } from './referenceMediaService';

export class SpeechProviderService {
  private static readonly COSYVOICE_SAMPLE_RATE = 22050;
  private static readonly COSYVOICE_PROMPT_TOO_LONG_MARKER = 'do not support extract speech token for audio longer than 30s';
  private static readonly DEFAULT_COSYVOICE_REQUEST_TIMEOUT_MS = 900_000;
  private static readonly cosyVoicePreparedPromptCache = new Map<string, string>();

  public static getActiveProvider(providerOverride?: SpeechProviderType): SpeechProviderType {
    return ConfigManager.getSpeechProvider(providerOverride);
  }

  public static extractTextFromMarkdown(markdown: string): string {
    return SpeechTextUtils.extractTextFromMarkdown(markdown);
  }

  public static splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
    return SpeechTextUtils.splitTextIntoChunks(text, maxChunkSize);
  }

  public static getPreferredOutputFormat(options: SpeechExecutionOptions = {}): AudioFormat {
    const provider = this.getActiveProvider(options.providerOverride);
    return provider === 'cosyvoice' || provider === 'qwen3-tts' ? 'wav' : 'mp3';
  }

  public static supportsVoiceCatalog(providerOverride?: SpeechProviderType): boolean {
    return this.getActiveProvider(providerOverride) === 'azure';
  }

  public static getVoiceList(): VoiceListItem[] {
    if (!this.supportsVoiceCatalog()) {
      return [];
    }

    return [];
  }

  public static createDebugArtifact(
    text: string,
    voice: VoiceSettings,
    options: SpeechExecutionOptions = {}
  ): { extension: 'ssml' | 'txt'; content: string } {
    const provider = this.getActiveProvider(options.providerOverride);
    if (provider === 'cosyvoice' || provider === 'qwen3-tts') {
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

  public static async synthesizeSpeech(
    text: string,
    voice: VoiceSettings,
    options: SpeechExecutionOptions = {}
  ): Promise<{ audioBuffer: Buffer; audioFormat: AudioFormat }> {
    const provider = this.getActiveProvider(options.providerOverride);
    if (provider === 'cosyvoice' || provider === 'qwen3-tts') {
      const result = await this.synthesizeWithMetadata(text, voice, options);
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

  public static async synthesizeWithMetadata(
    text: string,
    voice: VoiceSettings,
    options: SpeechExecutionOptions = {}
  ): Promise<SpeechSynthesisResult> {
    const provider = this.getActiveProvider(options.providerOverride);
    if (provider === 'cosyvoice') {
      return this.synthesizeWithCosyVoice(text);
    }

    if (provider === 'qwen3-tts') {
      return this.synthesizeWithQwenTts(text);
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

  private static async synthesizeWithQwenTts(text: string): Promise<SpeechSynthesisResult> {
    return QwenTtsService.synthesize(text, ConfigManager.getQwenTtsConfig());
  }

  private static async synthesizeWithCosyVoice(text: string): Promise<SpeechSynthesisResult> {
    const config = ConfigManager.getCosyVoiceConfig();
    this.validateCosyVoiceConfig(config);

    const hasPromptText = Boolean(config.promptText?.trim());
    const endpoint = `${this.normalizeBaseUrl(config.baseUrl)}/${hasPromptText ? 'inference_zero_shot' : 'inference_cross_lingual'}`;
    const promptText = config.promptText?.trim();
    const requestTimeoutMs = this.getCosyVoiceRequestTimeoutMs(config);
    const requestId = this.createCosyVoiceRequestId();
    const requestStartedAt = Date.now();
    const promptMode = hasPromptText ? 'zero_shot' : 'cross_lingual';

    console.info(
      `[Speechify][CosyVoice][${requestId}] Synthesis requested mode=${promptMode} textLength=${text.length} promptAudioPath=${config.promptAudioPath} timeoutMs=${requestTimeoutMs}`
    );

    try {
      const prepareStartedAt = Date.now();
      const preparedPromptPath = await this.prepareCosyVoicePromptAudio(config.promptAudioPath);
      console.info(
        `[Speechify][CosyVoice][${requestId}] Prompt audio prepared in ${Date.now() - prepareStartedAt}ms path=${preparedPromptPath}`
      );
      return await this.synthesizePreparedCosyVoice(text, endpoint, preparedPromptPath, promptText, requestId, requestTimeoutMs);
    } catch (error) {
      if (!this.isCosyVoicePromptTooLongError(error)) {
        console.error(
          `[Speechify][CosyVoice][${requestId}] Synthesis failed after ${Date.now() - requestStartedAt}ms:`,
          error
        );
        throw this.decorateCosyVoiceError(error);
      }

      try {
        console.warn(
          `[Speechify][CosyVoice][${requestId}] Backend reported prompt too long. Refreshing normalized prompt audio cache.`
        );
        const refreshStartedAt = Date.now();
        const refreshedPromptPath = await this.prepareCosyVoicePromptAudio(config.promptAudioPath, true);
        console.info(
          `[Speechify][CosyVoice][${requestId}] Prompt audio refreshed in ${Date.now() - refreshStartedAt}ms path=${refreshedPromptPath}`
        );
        return await this.synthesizePreparedCosyVoice(text, endpoint, refreshedPromptPath, promptText, requestId, requestTimeoutMs);
      } catch (retryError) {
        console.error(
          `[Speechify][CosyVoice][${requestId}] Retry failed after ${Date.now() - requestStartedAt}ms:`,
          retryError
        );
        throw this.decorateCosyVoiceError(retryError);
      }
    }
  }

  private static validateCosyVoiceConfig(config: CosyVoiceConfig): void {
    if (!config.baseUrl.trim()) {
      throw new Error(this.getCosyVoiceBaseUrlNotConfiguredMessage());
    }

    if (!config.promptAudioPath.trim()) {
      throw new Error(this.getCosyVoiceReferenceAudioPathNotConfiguredMessage());
    }

    if (!fs.existsSync(config.promptAudioPath)) {
      throw new Error(this.getCosyVoiceReferenceAudioFileNotFoundMessage(config.promptAudioPath));
    }
  }

  private static normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  private static async prepareCosyVoicePromptAudio(inputPath: string, forceRefresh = false): Promise<string> {
    const stats = fs.statSync(inputPath);
    const cacheKey = `${inputPath}:${stats.size}:${stats.mtimeMs}`;
    const cached = this.cosyVoicePreparedPromptCache.get(cacheKey);
    if (!forceRefresh && cached && fs.existsSync(cached)) {
      return cached;
    }

    if (cached && fs.existsSync(cached) && cached.startsWith(os.tmpdir())) {
      try {
        fs.unlinkSync(cached);
      } catch {
        // ignore cache cleanup failure
      }
    }
    this.cosyVoicePreparedPromptCache.delete(cacheKey);

    const normalizedPath = await ReferenceMediaService.normalizePromptAudioToTemp(inputPath);
    this.cosyVoicePreparedPromptCache.set(cacheKey, normalizedPath);

    for (const [key, value] of this.cosyVoicePreparedPromptCache.entries()) {
      if (key !== cacheKey && value.startsWith(os.tmpdir()) && fs.existsSync(value)) {
        try {
          fs.unlinkSync(value);
        } catch {
          // ignore cache cleanup failure
        }
        this.cosyVoicePreparedPromptCache.delete(key);
      }
    }

    return normalizedPath;
  }

  private static async synthesizePreparedCosyVoice(
    text: string,
    endpoint: string,
    preparedPromptPath: string,
    promptText?: string,
    requestId?: string,
    requestTimeoutMs?: number
  ): Promise<SpeechSynthesisResult> {
    const promptAudio = fs.readFileSync(preparedPromptPath);
    const pcmBuffer = await this.postMultipartToCosyVoice(
      endpoint,
      text,
      promptAudio,
      path.basename(preparedPromptPath),
      promptText,
      requestId,
      requestTimeoutMs
    );
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

  private static isCosyVoicePromptTooLongError(error: unknown): boolean {
    return error instanceof Error && error.message.includes(this.COSYVOICE_PROMPT_TOO_LONG_MARKER);
  }

  private static decorateCosyVoiceError(error: unknown): Error {
    if (this.isCosyVoicePromptTooLongError(error)) {
      return new Error(
        'CosyVoice reference audio exceeds the model limit of 30 seconds. Re-save or re-select the reference media so Speechify can normalize it to a short prompt.'
      );
    }

    return error instanceof Error ? error : new Error(String(error));
  }

  private static async postMultipartToCosyVoice(
    endpoint: string,
    text: string,
    promptAudio: Buffer,
    promptFileName: string,
    promptText?: string,
    requestId = this.createCosyVoiceRequestId(),
    requestTimeoutMs = this.DEFAULT_COSYVOICE_REQUEST_TIMEOUT_MS
  ): Promise<Buffer> {
    const boundary = `----speechify-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    const body = this.buildCosyVoiceMultipartBody(boundary, text, promptAudio, promptFileName, promptText);
    const url = new URL(endpoint);
    const client = url.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const endpointName = url.pathname.replace(/^\/+/, '') || 'unknown';
    let firstResponseByteAt = 0;

    console.info(
      `[Speechify][CosyVoice][${requestId}] POST ${endpointName} textLength=${text.length} promptBytes=${promptAudio.length} promptTextLength=${promptText?.length || 0}`
    );

    return new Promise<Buffer>((resolve, reject) => {
      const request = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
          },
          timeout: requestTimeoutMs
        },
        response => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => {
            if (!firstResponseByteAt) {
              firstResponseByteAt = Date.now();
              console.info(
                `[Speechify][CosyVoice][${requestId}] First response byte after ${firstResponseByteAt - startedAt}ms status=${response.statusCode || 0}`
              );
            }
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on('end', () => {
            const responseBuffer = Buffer.concat(chunks);
            if ((response.statusCode || 0) >= 400) {
              const message = responseBuffer.toString('utf8').trim() || response.statusMessage || 'Unknown error';
              reject(new Error(`CosyVoice request failed with ${response.statusCode} ${response.statusMessage || ''}: ${message}`.trim()));
              return;
            }
            console.info(
              `[Speechify][CosyVoice][${requestId}] Response completed in ${Date.now() - startedAt}ms bytes=${responseBuffer.length}`
            );
            resolve(responseBuffer);
          });
          response.on('aborted', () => {
            reject(new Error('CosyVoice response stream was aborted by the server.'));
          });
          response.on('error', error => {
            reject(new Error(`CosyVoice response error: ${error.message}`));
          });
        }
      );

      request.on('timeout', () => {
        request.destroy(
          new Error(
            `CosyVoice request timed out after ${Math.round(requestTimeoutMs / 1000)}s. requestId=${requestId} endpoint=${endpointName} textLength=${text.length} promptBytes=${promptAudio.length}`
          )
        );
      });
      request.on('error', error => {
        reject(new Error(`CosyVoice request failed: ${error.message}`));
      });

      request.write(body);
      request.end();
    });
  }

  private static buildCosyVoiceMultipartBody(
    boundary: string,
    text: string,
    promptAudio: Buffer,
    promptFileName: string,
    promptText?: string
  ): Buffer {
    const parts: Buffer[] = [];
    const pushTextField = (name: string, value: string): void => {
      parts.push(Buffer.from(`--${boundary}\r\n`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
      parts.push(Buffer.from(value));
      parts.push(Buffer.from('\r\n'));
    };

    pushTextField('tts_text', text);
    if (promptText) {
      pushTextField('prompt_text', promptText);
    }

    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="prompt_wav"; filename="${promptFileName}"\r\n`));
    parts.push(Buffer.from('Content-Type: audio/wav\r\n\r\n'));
    parts.push(promptAudio);
    parts.push(Buffer.from('\r\n'));
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return Buffer.concat(parts);
  }

  private static createCosyVoiceRequestId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private static getCosyVoiceRequestTimeoutMs(config: CosyVoiceConfig): number {
    const seconds = Number.isFinite(config.requestTimeoutSeconds)
      ? Math.max(30, Math.round(config.requestTimeoutSeconds as number))
      : Math.round(this.DEFAULT_COSYVOICE_REQUEST_TIMEOUT_MS / 1000);
    return seconds * 1000;
  }

  private static getCosyVoiceBaseUrlNotConfiguredMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '还没有配置 CosyVoice 的服务地址。'
      : 'CosyVoice base URL is not configured.';
  }

  private static getCosyVoiceReferenceAudioPathNotConfiguredMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '还没有配置 CosyVoice 的参考音频路径。'
      : 'CosyVoice reference audio path is not configured.';
  }

  private static getCosyVoiceReferenceAudioFileNotFoundMessage(promptAudioPath: string): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? `找不到 CosyVoice 的参考音频文件：${promptAudioPath}`
      : `CosyVoice reference audio file not found: ${promptAudioPath}`;
  }
}
