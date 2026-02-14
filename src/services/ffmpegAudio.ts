import { spawn } from 'child_process';

export interface MergeAudioSegmentInput {
  audioPath: string;
  startTime: number;
}

export function buildMergeAudioArgs(
  segments: MergeAudioSegmentInput[],
  outputPath: string
): { command: 'ffmpeg'; args: string[] } {
  const inputArgs = segments.flatMap((s) => ['-i', s.audioPath]);

  const delays = segments
    .map((s, i) => {
      const delay = Math.round(s.startTime * 1000);
      return `[${i}:a]adelay=${delay}|${delay}[a${i}]`;
    })
    .join('; ');

  const mixInput = segments.map((_, i) => `[a${i}]`).join('');
  const mix = `${delays}; ${mixInput}amix=inputs=${segments.length}:dropout_transition=0:normalize=0`;

  const args = ['-y', ...inputArgs, '-filter_complex', mix, outputPath];
  return { command: 'ffmpeg', args };
}

export async function mergeAudioWithOffsets(
  segments: MergeAudioSegmentInput[],
  outputPath: string
): Promise<void> {
  const { command, args } = buildMergeAudioArgs(segments, outputPath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
    });
  });
}
