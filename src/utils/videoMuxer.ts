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

      // Escape helper for drawtext
      const escapeTitle = (t: string) => t.replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
      
      // Use Heiti SC or Songti SC for macOS to avoid garbled Chinese characters
      const isMac = process.platform === 'darwin';
      // On macOS, FFmpeg drawtext often works better with the direct font name if fontconfig is active
      const fontPart = isMac ? `font='Heiti SC':` : ``;

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
        const maxTitleDuration = 3.0; // Show title for max 3 seconds
        const displayEnd = start + maxTitleDuration;

        const titleText = escapeTitle(seg.title);
        // Position: Top center, slightly below the edge
        titleFilters += (titleFilters ? `,` : ``) + 
          `drawtext=${fontPart}text='${titleText}':fontcolor=white:fontsize=44:box=1:boxcolor=black@0.5:boxborderw=15:x=(w-text_w)/2:y=60:enable='between(t,${start},${displayEnd})'`;
      }

      // --- SUBTITLE LOGIC ---
      const escapedSrtPath = sRel
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\\\''")
        .replace(/:/g, '\\:')
        .replace(/,/g, '\\,')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');

      let finalVideoFilter = `subtitles='${escapedSrtPath}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2'`;
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

      // Use tpad filter to clone the last frame and remove -shortest (or use it with a very long tpad)
      // This ensures that if audio is longer than video, the last frame of video is repeated.
      // We also use -shortest so it doesn't run forever if tpad is too long.
      const command = `ffmpeg -y -i ${vIn} -i ${aIn} -vf "subtitles='${escapedSrtPath}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2',tpad=stop_mode=clone:stop_duration=3600" -c:v libx264 -c:a aac -map 0:v:0 -map 1:a:0 -shortest ${oOut}`;

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
