import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcessByStdio } from 'child_process';
import { Readable, Writable } from 'stream';
import { I18n } from '../i18n';
import { COSYVOICE_MAX_PROMPT_DURATION_SEC } from '../utils/cosyVoiceAudio';

interface ActiveRecording {
  outputPath: string;
  process: ChildProcessByStdio<Writable, null, Readable>;
  closePromise: Promise<void>;
}

export class LocalAudioRecorderService {
  private static activeRecording: ActiveRecording | null = null;
  private static readonly CLEANUP_FILTER =
    'highpass=f=90,lowpass=f=7600,anlmdn=s=0.00008:p=0.002:r=0.01,afftdn=nf=-28:nt=w:sigma=4,speechnorm=e=4.5:r=0.00008:l=1';

  public static async startRecording(): Promise<string> {
    if (this.activeRecording) {
      throw new Error('A recording is already in progress.');
    }

    const outputPath = path.join(os.tmpdir(), `speechify-reference-${Date.now()}.wav`);
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'avfoundation',
      '-i',
      ':0',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-t',
      COSYVOICE_MAX_PROMPT_DURATION_SEC.toString(),
      '-y',
      outputPath
    ];
    const child = spawn('ffmpeg', args, {
      shell: false,
      stdio: ['pipe', 'ignore', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    const closePromise = new Promise<void>((resolve, reject) => {
      child.on('error', error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(I18n.t('errors.ffmpegNotAvailable')));
          return;
        }

        reject(error);
      });

      child.on('close', code => {
        if (code === 0 || code === 255) {
          resolve();
          return;
        }

        const message = stderr.trim() || `ffmpeg exited with code ${code}`;
        reject(new Error(message));
      });
    });

    this.activeRecording = {
      outputPath,
      process: child,
      closePromise
    };

    return outputPath;
  }

  public static async stopRecording(): Promise<string> {
    const current = this.activeRecording;
    if (!current) {
      throw new Error('No active recording.');
    }

    this.activeRecording = null;

    current.process.stdin.write('q\n');
    current.process.stdin.end();
    await current.closePromise;

    if (!fs.existsSync(current.outputPath)) {
      throw new Error('Recorded audio file was not created.');
    }

    return current.outputPath;
  }

  public static async cancelRecording(): Promise<void> {
    const current = this.activeRecording;
    if (!current) {
      return;
    }

    this.activeRecording = null;
    current.process.kill('SIGINT');

    try {
      await current.closePromise;
    } catch {
      // Ignore cancellation failures.
    }

    try {
      if (fs.existsSync(current.outputPath)) {
        fs.unlinkSync(current.outputPath);
      }
    } catch {
      // Ignore cleanup failures.
    }
  }

  public static async cleanupRecordingForReference(inputPath: string): Promise<string> {
    return await this.cleanupRecording(inputPath);
  }

  private static async cleanupRecording(inputPath: string): Promise<string> {
    const cleanedPath = path.join(os.tmpdir(), `speechify-reference-cleaned-${Date.now()}.wav`);

    try {
      await this.runFfmpeg([
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        '-af',
        this.CLEANUP_FILTER,
        '-y',
        cleanedPath
      ]);

      if (fs.existsSync(cleanedPath)) {
        try {
          fs.unlinkSync(inputPath);
        } catch {
          // Ignore cleanup failure for original temp recording.
        }

        return cleanedPath;
      }
    } catch (error) {
      console.warn('[Speechify] Recorder cleanup failed, falling back to raw recording:', error);
    }

    return inputPath;
  }

  private static async runFfmpeg(args: string[]): Promise<void> {
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
