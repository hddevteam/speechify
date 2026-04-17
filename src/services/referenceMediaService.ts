import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { I18n } from '../i18n';
import { buildCosyVoiceNormalizeArgs } from '../utils/cosyVoiceAudio';

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);

export class ReferenceMediaService {
  public static isAudioFile(filePath: string): boolean {
    return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  public static isVideoFile(filePath: string): boolean {
    return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  public static async resolveReferenceAudioPath(inputPath: string): Promise<string> {
    if (!this.isAudioFile(inputPath) && !this.isVideoFile(inputPath)) {
      throw new Error(`Unsupported reference media type: ${path.extname(inputPath) || inputPath}`);
    }

    const outputPath = await this.buildExtractedAudioPath(inputPath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await this.normalizeReferenceAudio(inputPath, outputPath);
    return outputPath;
  }

  private static async buildExtractedAudioPath(inputPath: string): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const fileStem = `${path.basename(inputPath, path.extname(inputPath))}_reference.wav`;

    if (workspaceRoot) {
      return path.join(workspaceRoot, '.speechify', 'reference-audio', fileStem);
    }

    return path.join(os.tmpdir(), fileStem);
  }

  public static async normalizePromptAudioToTemp(inputPath: string): Promise<string> {
    const outputPath = path.join(os.tmpdir(), `speechify-cosyvoice-prompt-${Date.now()}.wav`);
    await this.normalizeReferenceAudio(inputPath, outputPath);
    return outputPath;
  }

  private static async normalizeReferenceAudio(inputPath: string, outputPath: string): Promise<void> {
    const args = buildCosyVoiceNormalizeArgs(inputPath, outputPath);
    if (this.isVideoFile(inputPath)) {
      const insertAt = args.indexOf('-ac');
      args.splice(insertAt, 0, '-vn');
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', args, {
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe']
      });

      let stderr = '';
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      child.on('error', error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(I18n.t('errors.ffmpegNotAvailable')));
          return;
        }

        reject(error);
      });

      child.on('close', code => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
  }
}
