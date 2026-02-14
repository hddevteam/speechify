import * as assert from 'assert';
import { buildVisionConfigGuidance, buildVisionRuntimeGuidance } from '../../services/visionGuidance';
import { calculateShiftedSegments } from '../../services/segmentTiming';
import { buildMergeAudioArgs } from '../../services/ffmpegAudio';
import { TimingSegment } from '../../utils/videoAnalyzer';

suite('SpeechService Refactor Unit Tests', () => {
  const t = (key: string, ...args: string[]): string => `${key}:${args.join('|')}`;

  test('buildVisionConfigGuidance should prioritize missing fields', () => {
    const message = buildVisionConfigGuidance(
      { isValid: false, errors: ['missingApiKey', 'missingEndpoint', 'missingVisionDeployment'] },
      t
    );

    assert.ok(message.startsWith('errors.visionMissingFields:'), 'Should use missing fields guidance key');
    assert.ok(message.includes('visionApiKey'));
    assert.ok(message.includes('visionEndpoint'));
    assert.ok(message.includes('visionDeployment'));
  });

  test('buildVisionRuntimeGuidance should map status code 429', () => {
    const err = { response: { status: 429 } };
    const message = buildVisionRuntimeGuidance(err, null, t);

    assert.strictEqual(message, 'errors.visionHttp429:');
  });

  test('calculateShiftedSegments should keep monotonic targetStartTime when autoTrim enabled', () => {
    const segments: TimingSegment[] = [
      { startTime: 0, title: 'A', content: 'a', audioDuration: 3 },
      { startTime: 4, title: 'B', content: 'b', audioDuration: 4 }
    ];

    const shifted = calculateShiftedSegments(segments, {
      autoTrimVideo: true,
      enableTransitions: true
    });

    assert.ok(shifted.length === 2);
    assert.strictEqual(shifted[0]?.targetStartTime, 0);
    assert.ok((shifted[1]?.targetStartTime || 0) > (shifted[0]?.targetStartTime || 0));
  });

  test('buildMergeAudioArgs should not concatenate shell command and should preserve raw paths as args', () => {
    const merge = buildMergeAudioArgs(
      [
        { audioPath: '/tmp/safe.mp3', startTime: 0 },
        { audioPath: '/tmp/evil";rm -rf /;".mp3', startTime: 2.2 }
      ],
      '/tmp/out.mp3'
    );

    assert.ok(Array.isArray(merge.args));
    assert.strictEqual(merge.command, 'ffmpeg');
    assert.ok(merge.args.includes('/tmp/evil";rm -rf /;".mp3'), 'Path should be treated as raw arg, not shell string');
    assert.ok(merge.args.includes('-filter_complex'));
  });
});
