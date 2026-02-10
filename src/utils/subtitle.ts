import { WordBoundary } from '../types';
import * as fs from 'fs';

export class SubtitleUtils {
  /**
   * Convert word boundaries to SRT format
   */
  public static generateSRT(boundaries: WordBoundary[]): string {
    let srt = '';
    let index = 1;

    // Standard subtitle grouping logic: roughly 5-10 words per line
    const wordsPerSubtitle = 8;
    for (let i = 0; i < boundaries.length; i += wordsPerSubtitle) {
      const chunk = boundaries.slice(i, i + wordsPerSubtitle);
      const firstWord = chunk[0];
      const lastWord = chunk[chunk.length - 1];
      
      if (!firstWord || !lastWord) continue;

      const startTime = this.formatSrtTime(firstWord.audioOffset);
      const endTime = this.formatSrtTime(lastWord.audioOffset + (lastWord.duration || 0));
      const text = chunk.map(b => b.text).join('');

      srt += `${index}\n`;
      srt += `${startTime} --> ${endTime}\n`;
      srt += `${text}\n\n`;
      index++;
    }

    return srt;
  }

  /**
   * Format milliseconds to SRT time string (00:00:00,000)
   */
  private static formatSrtTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);

    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)},${this.pad(millis, 3)}`;
  }

  private static pad(n: number, z: number = 2): string {
    return n.toString().padStart(z, '0');
  }

  /**
   * Save SRT content to a file
   */
  public static async saveSRTFile(content: string, outputPath: string): Promise<void> {
    return fs.promises.writeFile(outputPath, content, 'utf-8');
  }
}
