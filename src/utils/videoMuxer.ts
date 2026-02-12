import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class VideoMuxer {
  /**
   * Mux video with segments, supporting transitions, trimming and titles
   */
  public static async muxVideoWithSegments(
    videoSourcePath: string,
    audioSourcePath: string,
    srtPath: string,
    outputPath: string,
    segments: any[],
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

      // Escape helper for drawtext text argument
      const escapeDrawText = (text: string): string => text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\\\''")
        .replace(/:/g, '\\:')
        .replace(/%/g, '\\%')
        .replace(/\n/g, '\\\\n');

      // Wrap long titles into 1-2 lines for better readability in short videos
      const wrapTitleText = (input: string, maxCharsPerLine = 18): string => {
        const trimmed = (input || '').trim();
        if (!trimmed) return '';

        const hasWhitespace = /\s/.test(trimmed);
        if (hasWhitespace) {
          const words = trimmed.split(/\s+/);
          const lines: string[] = [];
          let currentLine = '';

          for (const word of words) {
            const candidate = currentLine ? `${currentLine} ${word}` : word;
            if (candidate.length <= maxCharsPerLine) {
              currentLine = candidate;
            } else {
              if (currentLine) lines.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) lines.push(currentLine);
          return lines.slice(0, 2).join('\n');
        }

        // For CJK-heavy text without spaces, wrap by character length.
        const chunks: string[] = [];
        for (let i = 0; i < trimmed.length; i += maxCharsPerLine) {
          chunks.push(trimmed.slice(i, i + maxCharsPerLine));
          if (chunks.length >= 2) break;
        }
        return chunks.join('\n');
      };
      
      // Use Hiragino Sans GB for macOS as a reliable and elegant CJK font
      const isMac = process.platform === 'darwin';
      const macFontPath = '/System/Library/Fonts/Hiragino Sans GB.ttc';
      const titleFont = isMac ? macFontPath : 'Noto Sans CJK SC';
      const subtitleFont = isMac ? 'PingFang SC' : 'Noto Sans CJK SC';

      let filterComplex = '';
      let videoMap = '0:v';

      if (options.autoTrimVideo) {
        // --- AUTO-TRIM LOGIC ---
        // We need to cut the video into segments and then concat/xfade them
        const transitionDuration = options.enableTransitions ? 0.5 : 0;
        const paddingDuration = 0.8; // Buffer time after voice ends
        
        // Build segment filters with normalization to avoid xfade mismatches
        let segmentFilters = '';
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const start = seg.startTime;
            // Add padding plus transition for non-last segments
            const duration = (seg.audioDuration || 5) + paddingDuration + (i < segments.length - 1 ? transitionDuration : 0);
            // We force scale, fps and format to ensure all segments are identical for xfade
            segmentFilters += `[0:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[seg${i}]; `;
        }
        
        let lastV = 'seg0';
        if (options.enableTransitions && segments.length > 1) {
            let offset = (segments[0].audioDuration || 5) + paddingDuration;
            for (let i = 1; i < segments.length; i++) {
                const nextV = `vxfade${i}`;
                const type = options.transitionType || 'fade';
                segmentFilters += `[${lastV}][seg${i}]xfade=transition=${type}:duration=${transitionDuration}:offset=${offset}[${nextV}]; `;
                lastV = nextV;
                offset += (segments[i].audioDuration || 5) + paddingDuration;
            }
        } else {
            // Simple concat
            const inputs = segments.map((_, i) => `[seg${i}]`).join('');
            segmentFilters += `${inputs}concat=n=${segments.length}:v=1:a=0[concatv]; `;
            lastV = 'concatv';
        }
        
        filterComplex = segmentFilters;
        videoMap = lastV;
      }

      // --- TITLE OVERLAY LOGIC ---
      // We apply titles on the final video stream (either the original or the concated one)
      let titleFilters = '';
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.title) continue;

        const start = options.autoTrimVideo ? (seg.targetStartTime || 0) : seg.startTime;
        const wrappedTitle = wrapTitleText(seg.title, 18);
        if (!wrappedTitle) continue;

        const titleText = escapeDrawText(wrappedTitle);
        const lineCount = wrappedTitle.split('\n').length;
        const fontSize = lineCount > 1 ? 40 : 46;

        const titleLength = seg.title.trim().length;
        const maxTitleDuration = Math.min(4.2, Math.max(2.4, 1.8 + titleLength * 0.08));
        const displayEnd = start + maxTitleDuration;

        // Elegant title card: centered, soft box background, improved typography.
        // Using fontfile for macOS to ensure the font is found.
        const fontParam = isMac ? `fontfile='${titleFont}'` : `font='${titleFont}'`;
        titleFilters += (titleFilters ? `,` : ``) + 
          `drawtext=${fontParam}:text='${titleText}':fontcolor=white:fontsize=${fontSize}:line_spacing=12:box=1:boxcolor=black@0.45:boxborderw=20:shadowcolor=black@0.5:shadowx=0:shadowy=2:x=(w-text_w)/2:y=65:enable='between(t,${start.toFixed(2)},${displayEnd.toFixed(2)})'`;
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
        `FontSize=22`,
        `PrimaryColour=&H00FFFFFF`, // Pure white
        `OutlineColour=&H00000000`, // Black outline
        `BackColour=&H80000000`,    // 50% transparent shadow
        `BorderStyle=1`,            // Outline + Shadow style
        `Outline=1.2`,             // Thin, sharp outline
        `Shadow=1.0`,               // Subtle shadow
        `Blur=0.6`,                 // Soften the edges a bit
        `Spacing=0.5`,
        `Alignment=2`,
        `MarginL=50`,
        `MarginR=50`,
        `MarginV=35`
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
      await execAsync(command, { cwd: vDir });

      return outputPath;
    } catch (error: any) {
      console.error('Advanced Muxing error:', error);
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
        `FontSize=22`,
        `PrimaryColour=&H00FFFFFF`,
        `OutlineColour=&H00000000`,
        `BackColour=&H80000000`,
        `BorderStyle=1`,
        `Outline=1.2`,
        `Shadow=1.0`,
        `Blur=0.6`,
        `Spacing=0.5`,
        `Alignment=2`,
        `MarginL=50`,
        `MarginR=50`,
        `MarginV=35`
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
    } catch (error: any) {
      console.error('FFmpeg error details:', error);
      if (error.stderr) {
        console.error('FFmpeg stderr output:', error.stderr);
      }
      throw new Error(`Failed to mux video: ${error.message}`);
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
}
