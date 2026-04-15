import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';

export interface CosyVoiceTranscriptionOptions {
  language?: 'zh' | 'en' | 'auto';
  model?: string;
}

export class CosyVoiceReferenceService {
  private static readonly DEFAULT_MODEL = 'base';

  public static getCosyVoicePythonPath(): string | null {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const candidates = [
      path.join(workspaceRoot, 'vendor/CosyVoice/.venv310/bin/python'),
      path.join(workspaceRoot, 'vendor/CosyVoice/.venv/bin/python')
    ];

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
      throw new Error('CosyVoice Python runtime not found. Please install vendor/CosyVoice/.venv310 first.');
    }

    const model = options.model || this.DEFAULT_MODEL;
    const language = options.language || 'zh';
    const script = [
      'import json, sys, whisper',
      'audio_path = sys.argv[1]',
      'language = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "auto" else None',
      'model_name = sys.argv[3] if len(sys.argv) > 3 else "base"',
      'model = whisper.load_model(model_name)',
      'kwargs = {"fp16": False, "verbose": False}',
      'if language:',
      '    kwargs["language"] = language',
      'result = model.transcribe(audio_path, **kwargs)',
      'text = (result.get("text") or "").strip()',
      'print(json.dumps({"text": text}, ensure_ascii=False))'
    ].join('\n');

    return await new Promise<string>((resolve, reject) => {
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
          reject(new Error(stderr.trim() || `Whisper transcription failed with code ${code}`));
          return;
        }

        try {
          const payload = JSON.parse(stdout.trim()) as { text?: string };
          const text = (payload.text || '').trim();

          if (!text) {
            reject(new Error('Reference audio transcription returned empty text.'));
            return;
          }

          resolve(text);
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
}
