import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class VideoMuxer {
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
