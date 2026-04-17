import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { readSpeechifySettingValue } from '../utils/speechifySettings';

export interface CosyVoiceTranscriptionOptions {
  language?: 'zh' | 'en' | 'auto';
  model?: string;
}

export class CosyVoiceReferenceService {
  private static readonly DEFAULT_WHISPER_MODEL = 'base';
  private static readonly DEFAULT_MLX_WHISPER_MODEL = 'mlx-community/whisper-large-v3-turbo-q4';
  private static extensionPath: string | null = null;

  public static setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionPath = context.extensionPath;
  }

  public static getCosyVoicePythonPath(): string | null {
    const configuredPath = this.getConfiguredPythonPath();
    if (configuredPath && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const candidates = this.getCosyVoicePythonCandidates();

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  public static async transcribeReferenceAudio(
    audioPath: string,
    options: CosyVoiceTranscriptionOptions = {}
  ): Promise<string> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Reference audio file not found: ${audioPath}`);
    }

    const pythonPath = this.getCosyVoicePythonPath();
    if (!pythonPath) {
      const searched = this.getCosyVoicePythonCandidates().join(', ');
      throw new Error(`CosyVoice Python runtime not found. Searched: ${searched}`);
    }

    const preferMlx = process.platform === 'darwin';
    const model = options.model || (preferMlx ? this.DEFAULT_MLX_WHISPER_MODEL : this.DEFAULT_WHISPER_MODEL);
    const language = options.language || 'zh';

    if (preferMlx) {
      try {
        const mlxResult = await this.runTranscription(pythonPath, audioPath, language, model, 'mlx');
        console.log(`[Speechify] Reference transcription engine=${mlxResult.engine} model=${model}`);
        return mlxResult.text;
      } catch (error) {
        console.warn('[Speechify] MLX Whisper transcription failed, falling back to openai-whisper:', error);
      }
    }

    const whisperModel = options.model && !options.model.startsWith('mlx-community/')
      ? options.model
      : this.DEFAULT_WHISPER_MODEL;
    const whisperResult = await this.runTranscription(pythonPath, audioPath, language, whisperModel, 'whisper');
    console.log(`[Speechify] Reference transcription engine=${whisperResult.engine} model=${whisperModel}`);
    return whisperResult.text;
  }

  private static async runTranscription(
    pythonPath: string,
    audioPath: string,
    language: 'zh' | 'en' | 'auto',
    model: string,
    engine: 'mlx' | 'whisper'
  ): Promise<{ text: string; engine: string }> {
    const script = engine === 'mlx'
      ? [
          'import json, sys',
          'import mlx_whisper',
          'audio_path = sys.argv[1]',
          'language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "auto" else None',
          'model_name = sys.argv[3]',
          'kwargs = {}',
          'if language:',
          '    kwargs["language"] = language',
          'result = mlx_whisper.transcribe(audio_path, path_or_hf_repo=model_name, **kwargs)',
          'text = (result.get("text") or "").strip()',
          'print(json.dumps({"text": text, "engine": "mlx_whisper"}, ensure_ascii=False))'
        ].join('\n')
      : [
          'import json, sys, whisper',
          'audio_path = sys.argv[1]',
          'language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "auto" else None',
          'model_name = sys.argv[3]',
          'model = whisper.load_model(model_name)',
          'kwargs = {"fp16": False, "verbose": False}',
          'if language:',
          '    kwargs["language"] = language',
          'result = model.transcribe(audio_path, **kwargs)',
          'text = (result.get("text") or "").strip()',
          'print(json.dumps({"text": text, "engine": "whisper"}, ensure_ascii=False))'
        ].join('\n');

    return await new Promise<{ text: string; engine: string }>((resolve, reject) => {
      const child = spawn(pythonPath, ['-c', script, audioPath, language, model], {
        shell: false
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', reject);

      child.on('close', code => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `${engine} transcription failed with code ${code}`));
          return;
        }

        try {
          const payload = JSON.parse(stdout.trim()) as { text?: string; engine?: string };
          const text = (payload.text || '').trim();

          if (!text) {
            reject(new Error('Reference audio transcription returned empty text.'));
            return;
          }

          resolve({
            text,
            engine: payload.engine || engine
          });
        } catch (error) {
          reject(
            new Error(
              `Failed to parse transcription output: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      });
    });
  }

  private static getCosyVoicePythonCandidates(): string[] {
    const folders = vscode.workspace.workspaceFolders;
    const workspaceRoots = folders ? folders.map(folder => folder.uri.fsPath) : [];
    const roots = [
      ...(this.extensionPath ? [this.extensionPath] : []),
      ...workspaceRoots,
      process.cwd(),
      path.resolve(__dirname, '../../'),
      path.resolve(__dirname, '../../../'),
      path.resolve(__dirname, '../../../../')
    ];

    const uniqueRoots = [...new Set(roots)];
    const candidates = uniqueRoots.flatMap(root => [
      path.join(root, 'vendor/CosyVoice/.venv310/bin/python'),
      path.join(root, 'vendor/CosyVoice/.venv/bin/python')
    ]);

    return [...new Set(candidates)];
  }

  private static getConfiguredPythonPath(): string {
    const configured = readSpeechifySettingValue<string>(
      vscode.workspace.getConfiguration('speechify'),
      'cosyVoicePythonPath',
      ''
    ).trim();
    if (!configured) {
      return '';
    }

    if (path.isAbsolute(configured)) {
      return configured;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return path.resolve(workspaceRoot, configured);
    }

    return path.resolve(configured);
  }
}
