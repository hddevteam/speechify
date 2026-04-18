import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { QwenTtsConfig, SpeechSynthesisResult } from '../types';
import { SpeechTextUtils } from '../utils/speechText';
import { ReferenceMediaService } from './referenceMediaService';

export class QwenTtsService {
  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 900_000;
  private static readonly DEFAULT_SAMPLE_RATE = 24_000;
  private static readonly RESULT_MARKER = 'SPEECHIFY_QWEN_RESULT=';

  public static async synthesize(text: string, config: QwenTtsConfig): Promise<SpeechSynthesisResult> {
    this.validateConfig(config);

    const requestTimeoutMs = this.getRequestTimeoutMs(config.requestTimeoutSeconds);
    const requestId = Math.random().toString(36).slice(2, 10);
    const requestStartedAt = Date.now();
    const normalizedPromptPath = await ReferenceMediaService.normalizePromptAudioToTemp(config.promptAudioPath);

    console.info(
      `[Speechify][Qwen3-TTS][${requestId}] Synthesis requested model=${config.model} textLength=${text.length} promptAudioPath=${config.promptAudioPath} timeoutMs=${requestTimeoutMs}`
    );

    try {
      const generated = await this.runPythonSynthesis(text, {
        ...config,
        promptAudioPath: normalizedPromptPath
      }, requestTimeoutMs);
      const audioBuffer = fs.readFileSync(generated.audioPath);

      if (generated.audioPath.startsWith(os.tmpdir()) && fs.existsSync(generated.audioPath)) {
        try {
          fs.unlinkSync(generated.audioPath);
        } catch {
          // ignore temp cleanup failure
        }
      }

      const durationMs = Math.round((generated.frameCount / generated.sampleRate) * 1000);
      const boundaries = SpeechTextUtils.approximateBoundaries(text, durationMs);

      return {
        audioBuffer,
        audioFormat: 'wav',
        boundaries,
        durationMs,
        debugArtifactExtension: 'txt',
        debugArtifactContent: text
      };
    } catch (error) {
      console.error(
        `[Speechify][Qwen3-TTS][${requestId}] Synthesis failed after ${Date.now() - requestStartedAt}ms:`,
        error
      );
      throw error;
    } finally {
      if (normalizedPromptPath.startsWith(os.tmpdir()) && fs.existsSync(normalizedPromptPath)) {
        try {
          fs.unlinkSync(normalizedPromptPath);
        } catch {
          // ignore temp cleanup failure
        }
      }
    }
  }

  private static validateConfig(config: QwenTtsConfig): void {
    if (!config.pythonPath.trim()) {
      throw new Error('Qwen3-TTS Python path is not configured.');
    }

    if (!fs.existsSync(config.pythonPath)) {
      throw new Error(`Qwen3-TTS Python runtime not found: ${config.pythonPath}`);
    }

    if (!config.model.trim()) {
      throw new Error('Qwen3-TTS model is not configured.');
    }

    if (!config.promptAudioPath.trim()) {
      throw new Error('Qwen3-TTS reference audio path is not configured.');
    }

    if (!fs.existsSync(config.promptAudioPath)) {
      throw new Error(`Qwen3-TTS reference audio file not found: ${config.promptAudioPath}`);
    }
  }

  private static getRequestTimeoutMs(value: number | undefined): number {
    const normalized = Number.isFinite(value) ? Math.round(value as number) : this.DEFAULT_REQUEST_TIMEOUT_MS / 1000;
    return Math.max(30, normalized) * 1000;
  }

  private static async runPythonSynthesis(
    text: string,
    config: QwenTtsConfig,
    requestTimeoutMs: number
  ): Promise<{ audioPath: string; sampleRate: number; frameCount: number }> {
    const script = [
      'import json, os, sys, tempfile, wave',
      'import numpy as np',
      'from mlx_audio.tts.utils import load_model',
      'model_name = sys.argv[1]',
      'text = sys.argv[2]',
      'ref_audio = sys.argv[3]',
      'ref_text = sys.argv[4]',
      'model = load_model(model_name)',
      'kwargs = {"text": text, "ref_audio": ref_audio}',
      'if ref_text:',
      '    kwargs["ref_text"] = ref_text',
      'else:',
      '    kwargs["x_vector_only_mode"] = True',
      'results = list(model.generate(**kwargs))',
      'if not results:',
      '    raise RuntimeError("Qwen3-TTS returned no audio results.")',
      'audio = np.asarray(results[0].audio, dtype=np.float32).reshape(-1)',
      'audio = np.clip(audio, -1.0, 1.0)',
      'pcm = (audio * 32767.0).astype(np.int16)',
      'sample_rate = int(getattr(model, "sample_rate", 24000))',
      'fd, output_path = tempfile.mkstemp(prefix="speechify-qwen3-tts-", suffix=".wav")',
      'os.close(fd)',
      'with wave.open(output_path, "wb") as wav_file:',
      '    wav_file.setnchannels(1)',
      '    wav_file.setsampwidth(2)',
      '    wav_file.setframerate(sample_rate)',
      '    wav_file.writeframes(pcm.tobytes())',
      `print("${this.RESULT_MARKER}" + json.dumps({"audioPath": output_path, "sampleRate": sample_rate, "frameCount": int(pcm.shape[0])}, ensure_ascii=False))`
    ].join('\n');

    return await new Promise<{ audioPath: string; sampleRate: number; frameCount: number }>((resolve, reject) => {
      const child = spawn(
        config.pythonPath,
        ['-c', script, config.model, text, config.promptAudioPath, config.promptText || ''],
        {
          shell: false
        }
      );

      let stdout = '';
      let stderr = '';
      const timeoutHandle: NodeJS.Timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Qwen3-TTS request timed out after ${Math.round(requestTimeoutMs / 1000)}s.`));
      }, requestTimeoutMs);

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', reject);

      child.on('close', code => {
        clearTimeout(timeoutHandle);

        if (code !== 0) {
          reject(new Error(stderr.trim() || `Qwen3-TTS generation failed with code ${code}`));
          return;
        }

        try {
          const payload = this.parseSynthesisPayload(stdout);

          if (!payload.audioPath || !fs.existsSync(payload.audioPath)) {
            reject(new Error('Qwen3-TTS did not produce an audio file.'));
            return;
          }

          resolve({
            audioPath: payload.audioPath,
            sampleRate: payload.sampleRate || this.DEFAULT_SAMPLE_RATE,
            frameCount: payload.frameCount || 0
          });
        } catch (error) {
          reject(
            new Error(
              `Failed to parse Qwen3-TTS output: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      });
    });
  }

  private static parseSynthesisPayload(stdout: string): {
    audioPath?: string;
    sampleRate?: number;
    frameCount?: number;
  } {
    const trimmed = stdout.trim();
    const lines = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line) {
        continue;
      }

      if (line.startsWith(this.RESULT_MARKER)) {
        return JSON.parse(line.slice(this.RESULT_MARKER.length)) as {
          audioPath?: string;
          sampleRate?: number;
          frameCount?: number;
        };
      }
    }

    const fallbackLine = lines[lines.length - 1] || trimmed;
    return JSON.parse(fallbackLine) as {
      audioPath?: string;
      sampleRate?: number;
      frameCount?: number;
    };
  }
}
