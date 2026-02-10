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

      // FFmpeg command:
      // -i: input video
      // -i: input audio
      // -vf: video filter (subtitles) - note: ffmpeg needs absolute path for subtitles filter sometimes
      // -c:v: video codec (libx264)
      // -c:a: audio codec (aac)
      // -shortest: end when the shortest input (usually audio/video) ends
      // -y: overwrite output
      
      // Escape paths for shell and FFmpeg filters
      const vPath = `"${videoSourcePath}"`;
      const aPath = `"${audioSourcePath}"`;
      
      // FFmpeg subtitles filter path escaping is extremely specific:
      // 1. Double backslashes
      // 2. Escape colons
      // 3. Escape single quotes for the filter string
      const escapedSrtPath = srtPath
        .replace(/\\/g, '/') // Use forward slashes
        .replace(/'/g, "'\\\\''") // Escape single quotes
        .replace(/:/g, '\\:') // Escape colons
        .replace(/,/g, '\\,'); // Escape commas
        
      const outPath = `"${outputPath}"`;

      // Use tpad filter to clone the last frame and remove -shortest (or use it with a very long tpad)
      // This ensures that if audio is longer than video, the last frame of video is repeated.
      // We also use -shortest so it doesn't run forever if tpad is too long.
      const command = `ffmpeg -y -i ${vPath} -i ${aPath} -vf "subtitles='${escapedSrtPath}':force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2',tpad=stop_mode=clone:stop_duration=3600" -c:v libx264 -c:a aac -map 0:v:0 -map 1:a:0 -shortest ${outPath}`;

      console.log('Running FFmpeg:', command);
      
      const { stderr } = await execAsync(command);
      console.log('FFmpeg completed:', stderr);

      return outputPath;
    } catch (error: any) {
      console.error('FFmpeg error:', error);
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
