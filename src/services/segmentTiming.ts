import { TimingSegment } from '../utils/videoAnalyzer';

export interface ShiftedSegment extends TimingSegment {
  targetStartTime: number;
  targetDuration: number;
}

export function calculateShiftedSegments(
  segments: TimingSegment[],
  options: { autoTrimVideo: boolean; enableTransitions: boolean }
): ShiftedSegment[] {
  const paddingDuration = 0.8;
  const transitionDuration = options.enableTransitions ? 0.5 : 0;
  let cumulativeVideoTime = 0;

  return segments.map((seg, i) => {
    const strategy = seg.strategy || 'trim';
    const start = seg.startTime;
    const nextStart = segments[i + 1]?.startTime;

    const audioNeeded = (seg.audioDuration || 5) + paddingDuration;
    const tailNeeded = i < segments.length - 1 ? transitionDuration : 0;
    const totalNeeded = audioNeeded + tailNeeded;

    let visualAvailable = audioNeeded;
    if (typeof nextStart === 'number' && Number.isFinite(nextStart)) {
      visualAvailable = Math.max(0.033, nextStart - start);
    }

    let segmentDuration = totalNeeded;
    if (strategy === 'freeze') {
      segmentDuration = Math.max(totalNeeded, visualAvailable);
    } else if (strategy === 'speed_total' || strategy === 'speed_overflow' || strategy === 'trim') {
      segmentDuration = totalNeeded;
    }

    const targetStartTime = options.autoTrimVideo ? cumulativeVideoTime : seg.startTime;

    if (options.autoTrimVideo) {
      cumulativeVideoTime += segmentDuration - tailNeeded;
    }

    return {
      ...seg,
      targetStartTime,
      targetDuration: segmentDuration
    };
  });
}
