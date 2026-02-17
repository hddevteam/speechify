import { spawn } from 'child_process';
import { TimingAudioConfig, TimingSegment } from '../utils/videoAnalyzer';

export interface MergeAudioSegmentInput {
  audioPath: string;
  startTime: number;
  maxDurationSec?: number;
}

const SEGMENT_TAIL_FADE_SEC = 0.035;
const SPEED_OVERFLOW_AUTO_MUTE_TAIL_SEC = 2.2;

interface ComposeFinalAudioInput {
  videoSourcePath: string;
  narrationAudioPath: string;
  outputPath: string;
  segments: TimingSegment[];
  audioConfig?: TimingAudioConfig;
}

export function buildMergeAudioArgs(
  segments: MergeAudioSegmentInput[],
  outputPath: string
): { command: 'ffmpeg'; args: string[] } {
  const inputArgs = segments.flatMap((s) => ['-i', s.audioPath]);

  const filterChains = segments
    .map((s, i) => {
      const delay = Math.round(s.startTime * 1000);
      const hasTrim = typeof s.maxDurationSec === 'number' && Number.isFinite(s.maxDurationSec) && s.maxDurationSec > 0;

      if (hasTrim) {
        const trimmedDuration = s.maxDurationSec as number;
        const fadeDuration = Math.min(SEGMENT_TAIL_FADE_SEC, Math.max(0, trimmedDuration - 0.005));
        const fadeStart = trimmedDuration - fadeDuration;

        if (fadeDuration > 0.005 && fadeStart >= 0) {
          return `[${i}:a]atrim=0:${trimmedDuration.toFixed(3)},afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeDuration.toFixed(3)},asetpts=PTS-STARTPTS[t${i}];[t${i}]adelay=${delay}|${delay}[a${i}]`;
        }

        return `[${i}:a]atrim=0:${trimmedDuration.toFixed(3)},asetpts=PTS-STARTPTS[t${i}];[t${i}]adelay=${delay}|${delay}[a${i}]`;
      }

      return `[${i}:a]adelay=${delay}|${delay}[a${i}]`;
    })
    .join('; ');

  const mixInput = segments.map((_, i) => `[a${i}]`).join('');
  const mix = `${filterChains}; ${mixInput}amix=inputs=${segments.length}:dropout_transition=0:normalize=0`;

  const args = ['-y', ...inputArgs, '-filter_complex', mix, outputPath];
  return { command: 'ffmpeg', args };
}

export async function mergeAudioWithOffsets(
  segments: MergeAudioSegmentInput[],
  outputPath: string
): Promise<void> {
  const { command, args } = buildMergeAudioArgs(segments, outputPath);
  console.log('[AudioMerge] Segment plan:', segments.map((s, i) => ({
    index: i,
    startTime: Number(s.startTime.toFixed(3)),
    maxDurationSec: s.maxDurationSec !== undefined ? Number(s.maxDurationSec.toFixed(3)) : null,
    audioPath: s.audioPath
  })));
  console.log('[AudioMerge] FFmpeg args:', args.join(' '));

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

function dbToVolume(db: number): number {
  return Math.pow(10, db / 20);
}

function toSafeDecimal(value: number): string {
  return value.toFixed(3);
}

function normalizeMode(config?: TimingAudioConfig): NonNullable<TimingAudioConfig['mode']> {
  return config?.mode || 'replace';
}

function shouldMuteOriginalByDefault(): boolean {
  // Default behavior for speed_overflow is tail-only protection.
  // Full-segment mute should be opt-in (explicit override/rule).
  return false;
}

function shouldMuteOriginalForSegment(segment: TimingSegment, config?: TimingAudioConfig): boolean {
  const strategy = segment.strategy;
  // Segment mute is scoped to speed_overflow only.
  if (strategy !== 'speed_overflow') {
    return false;
  }

  const overrideMute = segment.audioOverride?.muteOriginal;
  if (overrideMute === true) {
    return true;
  }

  if (overrideMute === false) {
    return false;
  }

  const rule = config?.strategyRules?.[strategy];
  if (typeof rule?.allowOriginal === 'boolean') {
    return !rule.allowOriginal;
  }

  // No explicit override/rule -> do not mute full segment by default.
  return shouldMuteOriginalByDefault();
}

function computeSpeedOverflowMuteWindow(
  segment: TimingSegment,
  nextSegment: TimingSegment | undefined
): { start: number; end: number } | null {
  const shiftedStartRaw =
    'targetStartTime' in segment && typeof segment.targetStartTime === 'number'
      ? segment.targetStartTime
      : null;
  const shiftedDurationRaw =
    'targetDuration' in segment && typeof segment.targetDuration === 'number'
      ? segment.targetDuration
      : null;

  const segmentStart = shiftedStartRaw ?? segment.startTime;
  const segmentDuration = shiftedDurationRaw ?? (segment.audioDuration ?? 0);
  if (segmentDuration <= 0) {
    return null;
  }

  const factorRaw = Number(segment.speedFactor);
  const factor = Number.isFinite(factorRaw) ? Math.max(2, Math.floor(factorRaw)) : 2;

  const visualAvailable = nextSegment
    ? Math.max(0.033, nextSegment.startTime - segment.startTime)
    : segmentDuration;

  // X + (V - X) / N = W  => X = (N*W - V) / (N - 1)
  const xNormRaw = (factor * segmentDuration - visualAvailable) / (factor - 1);
  const xNorm = Math.max(0, Math.min(visualAvailable, xNormRaw));

  const overlapSafeEnd =
    nextSegment && 'targetStartTime' in nextSegment && typeof nextSegment.targetStartTime === 'number'
      ? nextSegment.targetStartTime
      : segmentStart + segmentDuration;

  const overflowStart = segmentStart + xNorm;
  const overflowEnd = Math.max(segmentStart, overlapSafeEnd);
  if (overflowEnd <= overflowStart + 0.005) {
    return null;
  }

  // Perceptual safeguard: keep background for most of the segment and only mute
  // a short accelerated tail to avoid audible bleed into the next segment.
  const shortTailStart = Math.max(segmentStart, overflowEnd - SPEED_OVERFLOW_AUTO_MUTE_TAIL_SEC);
  const clampedStart = Math.max(overflowStart, shortTailStart);
  if (overflowEnd <= clampedStart + 0.005) {
    return null;
  }

  return {
    start: clampedStart,
    end: overflowEnd
  };
}

function buildMuteWindows(segments: TimingSegment[], config?: TimingAudioConfig): Array<{ start: number; end: number }> {
  const windows: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }
    const nextSegment = segments[i + 1];

    // For speed_overflow, always mute the accelerated overflow tail.
    if (segment.strategy === 'speed_overflow') {
      const overflowWindow = computeSpeedOverflowMuteWindow(segment, nextSegment);
      if (overflowWindow) {
        windows.push(overflowWindow);
      }
    }

    // Optional full-segment mute override remains supported.
    if (!shouldMuteOriginalForSegment(segment, config)) {
      continue;
    }

    const shiftedStartRaw =
      'targetStartTime' in segment && typeof segment.targetStartTime === 'number'
        ? segment.targetStartTime
        : null;
    const shiftedDurationRaw =
      'targetDuration' in segment && typeof segment.targetDuration === 'number'
        ? segment.targetDuration
        : null;
    const start = shiftedStartRaw ?? segment.startTime;
    const duration = shiftedDurationRaw ?? (segment.audioDuration ?? 0);
    const end = start + Math.max(0, duration);

    if (end <= start) {
      continue;
    }

    windows.push({ start, end });
  }

  return windows;
}

function buildOriginalTrackFilter(
  segments: TimingSegment[],
  config: TimingAudioConfig | undefined,
  baseInputLabel: string,
  outputLabel: string,
  mode: NonNullable<TimingAudioConfig['mode']>
): string {
  const configuredGainDb = config?.originalGainDb;
  const baseGainDb =
    typeof configuredGainDb === 'number'
      ? configuredGainDb
      : mode === 'mix'
        ? 0
        : -14;
  const baseGain = dbToVolume(baseGainDb);
  const filters: string[] = [];

  const sliceLabels: string[] = [];
  const originalSlicePlan: Array<{
    index: number;
    sourceStart: number;
    sourceDuration: number;
    targetStart: number;
    targetDuration: number;
    usedDuration: number;
  }> = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }

    const nextSegment = segments[i + 1];
    const sourceStart = segment.startTime;
    const sourceDurationRaw = nextSegment
      ? Math.max(0.02, nextSegment.startTime - segment.startTime)
      : Math.max(0.02, ('targetDuration' in segment && typeof segment.targetDuration === 'number')
          ? segment.targetDuration
          : (segment.audioDuration ?? 0));

    const targetStart =
      'targetStartTime' in segment && typeof segment.targetStartTime === 'number'
        ? segment.targetStartTime
        : segment.startTime;
    const targetDuration =
      'targetDuration' in segment && typeof segment.targetDuration === 'number'
        ? Math.max(0.02, segment.targetDuration)
        : sourceDurationRaw;

    const usedDuration = Math.max(0.02, Math.min(sourceDurationRaw, targetDuration));
    const sliceLabel = `os${i}`;
    const delayedLabel = `od${i}`;
    const delay = Math.max(0, Math.round(targetStart * 1000));

    filters.push(
      `[${baseInputLabel}]atrim=start=${toSafeDecimal(sourceStart)}:end=${toSafeDecimal(sourceStart + usedDuration)},asetpts=PTS-STARTPTS,volume=${baseGain.toFixed(5)}[${sliceLabel}]`
    );
    filters.push(`[${sliceLabel}]adelay=${delay}|${delay}[${delayedLabel}]`);
    sliceLabels.push(`[${delayedLabel}]`);

    originalSlicePlan.push({
      index: i,
      sourceStart,
      sourceDuration: sourceDurationRaw,
      targetStart,
      targetDuration,
      usedDuration
    });
  }

  console.log('[AudioCompose] Original slice plan:', originalSlicePlan.map(s => ({
    index: s.index,
    sourceStart: Number(s.sourceStart.toFixed(3)),
    sourceDuration: Number(s.sourceDuration.toFixed(3)),
    targetStart: Number(s.targetStart.toFixed(3)),
    targetDuration: Number(s.targetDuration.toFixed(3)),
    usedDuration: Number(s.usedDuration.toFixed(3))
  })));

  if (sliceLabels.length === 0) {
    filters.push(`[${baseInputLabel}]volume=${baseGain.toFixed(5)}[orig0]`);
  } else if (sliceLabels.length === 1) {
    const only = sliceLabels[0];
    if (only) {
      filters.push(`${only}anull[orig0]`);
    }
  } else {
    filters.push(`${sliceLabels.join('')}amix=inputs=${sliceLabels.length}:duration=longest:dropout_transition=0:normalize=0[orig0]`);
  }

  const muteWindows = buildMuteWindows(segments, config);
  let current = 'orig0';

  for (let i = 0; i < muteWindows.length; i++) {
    const window = muteWindows[i];
    if (!window) {
      continue;
    }
    const next = `orig${i + 1}`;
    filters.push(
      `[${current}]volume=0:enable='between(t,${toSafeDecimal(window.start)},${toSafeDecimal(window.end)})'[${next}]`
    );
    current = next;
  }

  if (current !== outputLabel) {
    filters.push(`[${current}]anull[${outputLabel}]`);
  }

  return filters.join(';');
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { shell: false });

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

export async function composeFinalAudioTrack(input: ComposeFinalAudioInput): Promise<string> {
  const mode = normalizeMode(input.audioConfig);
  console.log('[AudioCompose] Mode:', mode, 'AudioConfig:', input.audioConfig || {});
  if (mode === 'replace') {
    console.log('[AudioCompose] Replace mode: use narration track directly', input.narrationAudioPath);
    return input.narrationAudioPath;
  }

  const narrationGain = dbToVolume(input.audioConfig?.narrationGainDb ?? 0);
  const muteWindows = buildMuteWindows(input.segments, input.audioConfig);
  console.log('[AudioCompose] Mute windows:', muteWindows.map(w => ({
    start: Number(w.start.toFixed(3)),
    end: Number(w.end.toFixed(3)),
    duration: Number((w.end - w.start).toFixed(3))
  })));
  console.log('[AudioCompose] Segment strategies:', input.segments.map((s, i) => ({
    index: i,
    strategy: s.strategy || 'trim',
    speedFactor: s.speedFactor ?? null,
    startTime: Number(s.startTime.toFixed(3)),
    targetStartTime: 'targetStartTime' in s && typeof s.targetStartTime === 'number' ? Number(s.targetStartTime.toFixed(3)) : null,
    targetDuration: 'targetDuration' in s && typeof s.targetDuration === 'number' ? Number(s.targetDuration.toFixed(3)) : null,
    muteOriginalOverride: s.audioOverride?.muteOriginal ?? null
  })));
  const originalFilter = buildOriginalTrackFilter(input.segments, input.audioConfig, '0:a', 'orig', mode);

  if (mode === 'mix') {
    const mixFilter = [
      originalFilter,
      `[1:a]volume=${narrationGain.toFixed(5)}[nar]`,
      '[orig]apad=pad_dur=7200[origpad]',
      '[nar][origpad]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]'
    ].join(';');
    console.log('[AudioCompose] Mix filter:', mixFilter);

    const mixArgs = [
      '-y',
      '-i',
      input.videoSourcePath,
      '-i',
      input.narrationAudioPath,
      '-filter_complex',
      mixFilter,
      '-map',
      '[outa]',
      '-c:a',
      'aac',
      input.outputPath
    ];

    await runFfmpeg(mixArgs);
    console.log('[AudioCompose] Final mix completed:', input.outputPath);
    return input.outputPath;
  }

  const duckingAttack = Math.max(10, Math.round(input.audioConfig?.ducking?.attackMs ?? 100));
  const duckingRelease = Math.max(30, Math.round(input.audioConfig?.ducking?.releaseMs ?? 300));
  const duckingThresholdDb = input.audioConfig?.ducking?.targetGainDb ?? -24;
  const threshold = Math.max(0.002, Math.min(0.2, dbToVolume(duckingThresholdDb)));

  const duckingFilter = [
    originalFilter,
    `[1:a]volume=${narrationGain.toFixed(5)}[nar]`,
    '[orig]apad=pad_dur=7200[origpad]',
    `[origpad][nar]sidechaincompress=threshold=${threshold.toFixed(5)}:ratio=10:attack=${duckingAttack}:release=${duckingRelease}[ducked]`,
    '[nar][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]'
  ].join(';');
  console.log('[AudioCompose] Ducking filter:', duckingFilter);

  const duckingArgs = [
    '-y',
    '-i',
    input.videoSourcePath,
    '-i',
    input.narrationAudioPath,
    '-filter_complex',
    duckingFilter,
    '-map',
    '[outa]',
    '-c:a',
    'aac',
    input.outputPath
  ];

  await runFfmpeg(duckingArgs);
  console.log('[AudioCompose] Final ducking mix completed:', input.outputPath);
  return input.outputPath;
}
