import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

interface MuxSegment {
  startTime: number;
  title?: string;
  strategy?: 'trim' | 'speed_total' | 'speed_overflow' | 'freeze' | string;
  speedFactor?: number;
  audioDuration?: number;
  targetStartTime?: number;
  targetDuration?: number;
}

export class VideoMuxer {
  /**
   * Mux video with segments, supporting transitions, trimming and titles
   */
  public static async muxVideoWithSegments(
    videoSourcePath: string,
    audioSourcePath: string,
    srtPath: string,
    outputPath: string,
    segments: MuxSegment[],
    options: {
      enableTransitions?: boolean;
      transitionType?: string;
      autoTrimVideo?: boolean;
    } = {}
  ): Promise<string> {
    try {
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`[Muxer] Starting advanced muxing. Trim: ${options.autoTrimVideo}, Transitions: ${options.enableTransitions}`);

      const vDir = path.dirname(videoSourcePath);
      const vBase = path.basename(videoSourcePath);
      const sRel = path.relative(vDir, srtPath);
      const aRel = path.relative(vDir, audioSourcePath);
      const { width: videoWidth, height: videoHeight } = await this.getVideoDimensions(videoSourcePath);
      const titleMaxWidthPx = Math.floor(videoWidth * (2 / 3));
      const textLayout = this.getTextLayoutScale(videoWidth, videoHeight);

      // Escape helper for drawtext text argument
      const escapeDrawText = (text: string): string => text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\\\''")
        .replace(/,/g, '\\,')
        .replace(/:/g, '\\:')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/%/g, '\\%');

      const getVisualUnits = (text: string): number => {
        let units = 0;
        for (const ch of text) {
          if (/\s/.test(ch)) {
            units += 0.35;
          } else if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(ch)) {
            units += 1;
          } else if (/[A-Z]/.test(ch)) {
            units += 0.68;
          } else if (/[a-z0-9]/.test(ch)) {
            units += 0.56;
          } else {
            units += 0.42;
          }
        }
        return units;
      };

      const splitByUnits = (input: string, maxUnitsPerLine: number): string[] => {
        const chunks: string[] = [];
        let current = '';

        for (const ch of input) {
          const candidate = `${current}${ch}`;
          if (current && getVisualUnits(candidate) > maxUnitsPerLine) {
            chunks.push(current);
            current = ch;
          } else {
            current = candidate;
          }
        }

        if (current) {
          chunks.push(current);
        }

        return chunks.filter(Boolean);
      };

      // Wrap long titles into multiple lines while preserving full content
      const wrapTitleText = (input: string, maxUnitsPerLine: number): string[] => {
        const trimmed = (input || '').trim();
        if (!trimmed) return [];

        const hasWhitespace = /\s/.test(trimmed);
        if (hasWhitespace) {
          const words = trimmed.split(/\s+/);
          const lines: string[] = [];
          let currentLine = '';

          for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (getVisualUnits(candidate) <= maxUnitsPerLine) {
              currentLine = candidate;
            } else {
              if (currentLine) lines.push(currentLine);
              if (getVisualUnits(word) <= maxUnitsPerLine) {
                currentLine = word;
              } else {
                const hardSplit = splitByUnits(word, maxUnitsPerLine);
                if (hardSplit.length > 1) {
                  lines.push(...hardSplit.slice(0, -1));
                  currentLine = hardSplit[hardSplit.length - 1] || '';
                } else {
                  currentLine = word;
                }
              }
            }
          }
          if (currentLine) lines.push(currentLine);
          return lines;
        }

        const chunks = splitByUnits(trimmed, maxUnitsPerLine);

        if (chunks.length === 2 && /^[，。！？；：,.!?;:]/.test(chunks[1] || '')) {
          const firstChar = chunks[1]?.charAt(0) || '';
          if (firstChar) {
            chunks[0] = `${chunks[0]}${firstChar}`;
            chunks[1] = (chunks[1] || '').slice(1).trimStart();
          }
        }

        return chunks.filter(Boolean);
      };

      const containsCJK = (text: string): boolean => /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(text);
      const getUnitPxByFont = (fontSize: number, hasCJK: boolean): number =>
        hasCJK ? fontSize * 0.95 : fontSize * 0.62;
      
      // Use Hiragino Sans GB for macOS as a reliable and elegant CJK font
      const isMac = process.platform === 'darwin';
      const macFontPath = '/System/Library/Fonts/Hiragino Sans GB.ttc';
      const titleFont = isMac ? macFontPath : 'Noto Sans CJK SC';
      const subtitleFont = isMac ? 'PingFang SC' : 'Noto Sans CJK SC';

      let filterComplex = '';
      let videoMap = '0:v';

      if (options.autoTrimVideo && segments.length > 0) {
        // --- AUTO-TRIM LOGIC ---
        // We need to cut the video into segments and then concat/xfade them
        const transitionDuration = options.enableTransitions ? 0.5 : 0;
        const paddingDuration = 0.8; // Buffer time after voice ends
        const targetFps = 30;
        const frameDuration = 1 / targetFps;
        
        // Build segment filters with normalization to avoid xfade mismatches
        let segmentFilters = '';
        let xfadeOffsetCumulative = 0;
        
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
          if (!seg) continue;
            const strategy = seg.strategy || 'trim'; // Default to trim
            const start = seg.startTime;
            const nextStart = segments[i + 1]?.startTime;
            
            const audioNeeded = (seg.audioDuration || 5) + paddingDuration;
            const tailNeeded = (i < segments.length - 1) ? transitionDuration : 0;
            const totalNeeded = audioNeeded + tailNeeded;

            let visualAvailable = audioNeeded; // Default if no next segment
            if (typeof nextStart === 'number' && Number.isFinite(nextStart)) {
              visualAvailable = Math.max(frameDuration, nextStart - start);
            }

            let segmentDuration = totalNeeded;
            let sourceReadDuration = totalNeeded;
            let ptsFilter = 'PTS-STARTPTS';

            if (strategy === 'speed_total') {
              segmentDuration = totalNeeded;
              sourceReadDuration = visualAvailable;
              const ratio = segmentDuration / sourceReadDuration;
              ptsFilter = `(PTS-STARTPTS)*${ratio.toFixed(4)}`;
            } else if (strategy === 'speed_overflow') {
              const rawFactor = Number(seg.speedFactor);
              const factor = Number.isFinite(rawFactor) ? Math.max(2, Math.floor(rawFactor)) : 2;
              segmentDuration = totalNeeded;
              sourceReadDuration = visualAvailable;
              
              // Solve: X + (V - X) / N = W  => X = (NW - V) / (N - 1)
              let xNorm = (factor * segmentDuration - sourceReadDuration) / (factor - 1);
              xNorm = Math.max(0, Math.min(sourceReadDuration, xNorm));
              
              // Use PTS-domain expression (setpts expects PTS units, not seconds).
              // xNorm is in seconds, so convert to PTS via /TB.
              const relPts = '(PTS-STARTPTS)';
              const xPts = `(${xNorm.toFixed(4)}/TB)`;
              ptsFilter = `if(lt(${relPts},${xPts}),${relPts},${xPts}+(${relPts}-${xPts})/${factor})`;
            } else if (strategy === 'freeze') {
              // Play fully: segment duration is the maximum of audio needs and visual reality
              segmentDuration = Math.max(totalNeeded, visualAvailable);
              sourceReadDuration = visualAvailable;
              ptsFilter = 'PTS-STARTPTS';
            } else { // 'trim'
              segmentDuration = totalNeeded;
              sourceReadDuration = Math.min(totalNeeded, visualAvailable);
              ptsFilter = 'PTS-STARTPTS';
            }

            // Record target timing for title/subtitle overlays
            seg.targetStartTime = xfadeOffsetCumulative;
            seg.targetDuration = segmentDuration;

            const freezePadDuration = Math.max(0, segmentDuration - (strategy === 'speed_total' || strategy === 'speed_overflow' ? segmentDuration : sourceReadDuration));
            const freezePadFrames = Math.max(0, Math.ceil(freezePadDuration * targetFps));

            // Construct filter for this segment
            segmentFilters += `[0:v]trim=start=${start}:duration=${sourceReadDuration},setpts='${ptsFilter}',fps=${targetFps}`;
            if (freezePadFrames > 0) {
              segmentFilters += `,tpad=stop_mode=clone:stop=${freezePadFrames}`;
            }
            segmentFilters += `,trim=duration=${segmentDuration.toFixed(3)},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[seg${i}]; `;

            // Increment cumulative offset for next segment's xfade
            xfadeOffsetCumulative += (segmentDuration - tailNeeded);
        }
        
        let lastV = 'seg0';
        if (options.enableTransitions && segments.length > 1) {
          const firstSeg = segments[0];
          if (!firstSeg) {
            throw new Error('Invalid segment data for transition rendering.');
          }
          let currentXfadeOffset = (firstSeg.targetDuration || 0) - transitionDuration;
            for (let i = 1; i < segments.length; i++) {
            const currentSeg = segments[i];
            if (!currentSeg) continue;
                const nextV = `vxfade${i}`;
                const type = options.transitionType || 'fade';
                segmentFilters += `[${lastV}][seg${i}]xfade=transition=${type}:duration=${transitionDuration}:offset=${currentXfadeOffset.toFixed(3)}[${nextV}]; `;
                lastV = nextV;
            currentXfadeOffset += ((currentSeg.targetDuration || 0) - transitionDuration);
            }
        } else if (segments.length > 1) {
            // Simple concat
            const inputs = segments.map((_, i) => `[seg${i}]`).join('');
            segmentFilters += `${inputs}concat=n=${segments.length}:v=1:a=0[concatv]; `;
            lastV = 'concatv';
        }

        // Add padding to the last segment to ensure video length covers audio length
        // We use tpad to clone the last frame of the final processed video stream
        segmentFilters += `[${lastV}]tpad=stop_mode=clone:stop_duration=3600[paddedv]; `;
        lastV = 'paddedv';
        
        filterComplex = segmentFilters;
        videoMap = lastV;
      } else if (options.autoTrimVideo && segments.length === 0) {
        console.warn('[Muxer] autoTrimVideo enabled but segments is empty. Falling back to full video stream.');
      }

      // --- TITLE OVERLAY LOGIC ---
      // We apply titles on the final video stream (either the original or the concated one)
      let titleFilters = '';
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) continue;
        if (!seg.title) continue;

        const start = options.autoTrimVideo ? (seg.targetStartTime || 0) : seg.startTime;
        const hasCJK = containsCJK(seg.title);
        const boxHorizontalPadding = Math.max(20, Math.round(36 * textLayout.titleScale));

        // Pass 1: wrap with baseline font size to estimate line count.
        const baselineFontSize = Math.max(28, Math.round(52 * textLayout.titleScale));
        const baselineUnitPx = getUnitPxByFont(baselineFontSize, hasCJK);
        const maxUnitsPass1 = Math.max(8, Math.floor((titleMaxWidthPx - boxHorizontalPadding * 2) / baselineUnitPx));
        let wrappedLines = wrapTitleText(seg.title, maxUnitsPass1);
        if (wrappedLines.length === 0) continue;

        let lineCount = wrappedLines.length;
        let fontSize = lineCount <= 1 ? 64 : lineCount === 2 ? 52 : lineCount === 3 ? 44 : 38;
        fontSize = Math.max(28, Math.round(fontSize * textLayout.titleScale));

        // Pass 2: re-wrap with final font size so 2/3 width constraint is respected.
        const finalUnitPx = getUnitPxByFont(fontSize, hasCJK);
        const maxUnitsPass2 = Math.max(8, Math.floor((titleMaxWidthPx - boxHorizontalPadding * 2) / finalUnitPx));
        wrappedLines = wrapTitleText(seg.title, maxUnitsPass2);
        lineCount = wrappedLines.length;
        fontSize = lineCount <= 1 ? 64 : lineCount === 2 ? 52 : lineCount === 3 ? 44 : 38;
        fontSize = Math.max(28, Math.round(fontSize * textLayout.titleScale));

        const titleLength = seg.title.trim().length;
        const maxTitleDuration = Math.min(6.2, Math.max(2.8, 1.8 + titleLength * 0.085 + (lineCount - 1) * 0.35));
        const displayEnd = start + maxTitleDuration;

        // Elegant title card: centered, with fade in/out animation for a modern feel.
        const startFade = 0.4;
        const endFade = 0.5;
        const alpha = `if(lt(t,${start}+${startFade}),(t-${start})/${startFade},if(gt(t,${displayEnd}-${endFade}),(${displayEnd}-t)/${endFade},1))`;

        // Using fontfile for macOS to ensure the font is found.
        const fontParam = isMac ? `fontfile='${titleFont}'` : `font='${titleFont}'`;
        const boxBorderBase = lineCount <= 1 ? 18 : lineCount === 2 ? 14 : 12;
        const lineSpacingBase = lineCount <= 1 ? 0 : lineCount === 2 ? 28 : 20;
        const boxBorderW = Math.max(8, Math.round(boxBorderBase * textLayout.titleScale));
        const lineSpacing = Math.max(0, Math.round(lineSpacingBase * textLayout.titleScale));
        const lineStep = fontSize + (boxBorderW * 2) + lineSpacing;
        const totalBlockHeight = (lineCount * (fontSize + boxBorderW * 2)) + ((lineCount - 1) * lineSpacing);

        for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex++) {
          const lineText = wrappedLines[lineIndex] || '';
          if (!lineText) continue;

          const escapedLine = escapeDrawText(lineText);
          const baselineOffset = (lineIndex * lineStep) - (totalBlockHeight / 2) + boxBorderW;
          const offsetAbs = Math.abs(baselineOffset).toFixed(1);
          const yExpr = baselineOffset >= 0 ? `(h/2)+${offsetAbs}` : `(h/2)-${offsetAbs}`;

          titleFilters += (titleFilters ? `,` : ``) +
            `drawtext=${fontParam}:text='${escapedLine}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.62:boxborderw=${boxBorderW}:shadowcolor=black@0.8:shadowx=0:shadowy=4:x=(w-text_w)/2:y=${yExpr}:alpha='${alpha}':enable='between(t,${start.toFixed(2)},${displayEnd.toFixed(2)})'`;
        }
      }

      // --- SUBTITLE LOGIC ---
      const escapedSrtPath = sRel
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\\\''")
        .replace(/:/g, '\\:')
        .replace(/,/g, '\\,')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');

      const subtitleStyle = [
        `FontName=${subtitleFont}`,
        `FontSize=${textLayout.subtitleFontSize}`,
        `PrimaryColour=&H00FFFFFF`, // Pure white
        `OutlineColour=&H00000000`, // Black outline
        `BackColour=&H95000000`,    // More transparent shadow
        `BorderStyle=1`,            // Outline + Shadow style
        `Outline=${textLayout.subtitleOutline.toFixed(2)}`,             // Sharper outline
        `Shadow=${textLayout.subtitleShadow.toFixed(2)}`,
        `Blur=${textLayout.subtitleBlur.toFixed(2)}`,                 // Soften the edges a bit
        `Spacing=${textLayout.subtitleSpacing.toFixed(2)}`,
        `Alignment=2`,
        `MarginL=${textLayout.subtitleMarginL}`,
        `MarginR=${textLayout.subtitleMarginR}`,
        `MarginV=${textLayout.subtitleMarginV}`                // Positioned slightly higher for modern look
      ].join(',');

      let finalVideoFilter = `subtitles='${escapedSrtPath}':force_style='${subtitleStyle}'`;
      if (titleFilters) {
          finalVideoFilter += `,${titleFilters}`;
      }
      
      // Combine trim/concat/xfade with title/subtitle
      if (filterComplex) {
          filterComplex += `[${videoMap}]${finalVideoFilter}[finalv]`;
          videoMap = 'finalv';
      } else {
          filterComplex = `[0:v]${finalVideoFilter}[finalv]`;
          videoMap = 'finalv';
      }

      const command = `ffmpeg -y -i "${vBase}" -i "${aRel}" -filter_complex "${filterComplex}" -map "[${videoMap}]" -map 1:a:0 -c:v libx264 -c:a aac -shortest "${path.relative(vDir, outputPath)}"`;

      console.log('Running Advanced FFmpeg command:', command);
      // Increased maxBuffer to 5MB to handle long command lines and large filter graphs
      await execAsync(command, { cwd: vDir, maxBuffer: 5 * 1024 * 1024 });

      console.log(`[Muxer] Advanced muxing completed: ${outputPath}`);
      return outputPath;
    } catch (error: unknown) {
      console.error('Advanced Muxing error:', error);
      if (error && typeof error === 'object' && 'stderr' in error) {
        const stderrText = String((error as { stderr?: unknown }).stderr || '');
        const tail = stderrText.slice(-2500);
        console.error('[Muxer] FFmpeg stderr tail:\n', tail);
      }
      throw error;
    }
  }

  /**
   * Mux audio and subtitles into video using FFmpeg
   */
  public static async muxVideo(
    videoSourcePath: string,
    audioSourcePath: string,
    srtPath: string,
    outputPath: string
  ): Promise<string> {
    try {
      // Create output directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const vDir = path.dirname(videoSourcePath);
      const vBase = path.basename(videoSourcePath);
      const aRel = path.relative(vDir, audioSourcePath);
      const sRel = path.relative(vDir, srtPath);
      const { width: videoWidth, height: videoHeight } = await this.getVideoDimensions(videoSourcePath);
      const textLayout = this.getTextLayoutScale(videoWidth, videoHeight);
      const isMac = process.platform === 'darwin';
      // PingFang SC is usually available to libass on Mac via CoreText/FontConfig
      const subtitleFont = isMac ? 'PingFang SC' : 'Noto Sans CJK SC';

      // In FFmpeg's subtitles filter, the filename must be properly escaped.
      // Since we are using relative paths now, it's much safer.
      // We still need to escape characters that are special to the filter parser: ' : , [ ]
      const escapedSrtPath = sRel
        .replace(/\\/g, '/')       // Use forward slashes
        .replace(/'/g, "'\\\\''")  // Escape single quotes for filter (very tricky)
        .replace(/:/g, '\\:')      // Escape colons
        .replace(/,/g, '\\,')      // Escape commas
        .replace(/\[/g, '\\[')    // Escape brackets
        .replace(/\]/g, '\\]');

      // Use a more robust way to quote experimental paths with spaces
      const vIn = `"${vBase}"`;
      const aIn = `"${aRel}"`;
      const oOut = `"${path.relative(vDir, outputPath)}"`;

      const subtitleStyle = [
        `FontName=${subtitleFont}`,
        `FontSize=${textLayout.subtitleFontSize}`,
        `PrimaryColour=&H00FFFFFF`, // Pure white
        `OutlineColour=&H00000000`, // Black outline
        `BackColour=&H95000000`,    // More transparent shadow
        `BorderStyle=1`,            // Outline + Shadow style
        `Outline=${textLayout.subtitleOutline.toFixed(2)}`,             // Sharper outline
        `Shadow=${textLayout.subtitleShadow.toFixed(2)}`,
        `Blur=${textLayout.subtitleBlur.toFixed(2)}`,                 // Soften the edges a bit
        `Spacing=${textLayout.subtitleSpacing.toFixed(2)}`,
        `Alignment=2`,
        `MarginL=${textLayout.subtitleMarginL}`,
        `MarginR=${textLayout.subtitleMarginR}`,
        `MarginV=${textLayout.subtitleMarginV}`                // Positioned slightly higher for modern look
      ].join(',');

      // Use tpad filter to clone the last frame and remove -shortest (or use it with a very long tpad)
      // This ensures that if audio is longer than video, the last frame of video is repeated.
      // We also use -shortest so it doesn't run forever if tpad is too long.
      const command = `ffmpeg -y -i ${vIn} -i ${aIn} -vf "subtitles='${escapedSrtPath}':force_style='${subtitleStyle}',tpad=stop_mode=clone:stop_duration=3600" -c:v libx264 -c:a aac -map 0:v:0 -map 1:a:0 -shortest ${oOut}`;

      console.log('Running FFmpeg in CWD:', vDir);
      console.log('Command:', command);
      
      const { stderr } = await execAsync(command, { cwd: vDir });
      console.log('FFmpeg completed. Stderr length:', stderr.length);

      // Verify file existence
      if (!fs.existsSync(outputPath)) {
        throw new Error(`FFmpeg completed but output file was not created at: ${outputPath}`);
      }
      
      const stats = fs.statSync(outputPath);
      console.log(`Output file created: ${outputPath} (${stats.size} bytes)`);

      return outputPath;
    } catch (error: unknown) {
      console.error('FFmpeg error details:', error);
      if (error && typeof error === 'object' && 'stderr' in error) {
        console.error('FFmpeg stderr output:', (error as { stderr?: unknown }).stderr);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to mux video: ${message}`);
    }
  }

  /**
   * Check if FFmpeg is installed
   */
  public static async isFFmpegAvailable(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch {
      return false;
    }
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private static getTextLayoutScale(videoWidth: number, videoHeight: number): {
    subtitleFontSize: number;
    subtitleMarginL: number;
    subtitleMarginR: number;
    subtitleMarginV: number;
    subtitleOutline: number;
    subtitleShadow: number;
    subtitleBlur: number;
    subtitleSpacing: number;
    titleScale: number;
  } {
    const safeWidth = Math.max(1, videoWidth || 0);
    const safeHeight = Math.max(1, videoHeight || 0);
    const shortEdge = Math.min(safeWidth, safeHeight);
    const isPortrait = safeHeight > safeWidth;

    const shortEdgeScale = this.clamp(shortEdge / 1080, 0.70, 1.15);
    const portraitRatio = safeWidth / safeHeight;
    const portraitPenalty = isPortrait ? this.clamp(portraitRatio / 0.75, 0.72, 1) : 1;
    const subtitleScale = this.clamp(shortEdgeScale * portraitPenalty, 0.65, 1.20);
    const titleScale = this.clamp(subtitleScale * (isPortrait ? 0.95 : 1), 0.62, 1.10);

    return {
      subtitleFontSize: Math.max(16, Math.round(24 * subtitleScale)),
      subtitleMarginL: Math.max(28, Math.round(60 * subtitleScale)),
      subtitleMarginR: Math.max(28, Math.round(60 * subtitleScale)),
      subtitleMarginV: Math.max(30, Math.round(65 * subtitleScale)),
      subtitleOutline: this.clamp(1.5 * subtitleScale, 1.0, 2.0),
      subtitleShadow: this.clamp(1.5 * subtitleScale, 1.0, 2.0),
      subtitleBlur: this.clamp(0.8 * subtitleScale, 0.5, 1.2),
      subtitleSpacing: this.clamp(0.8 * subtitleScale, 0.5, 1.2),
      titleScale
    };
  }

  private static async getVideoDimensions(videoSourcePath: string): Promise<{ width: number; height: number }> {
    try {
      const escapedPath = videoSourcePath.replace(/"/g, '\\"');
      const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "${escapedPath}"`;
      const { stdout } = await execAsync(command);
      const [wRaw, hRaw] = stdout.trim().split('x');
      const width = Number.parseInt((wRaw || '').trim(), 10);
      const height = Number.parseInt((hRaw || '').trim(), 10);
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        return { width, height };
      }
      return { width: 1920, height: 1080 };
    } catch {
      return { width: 1920, height: 1080 };
    }
  }
}
