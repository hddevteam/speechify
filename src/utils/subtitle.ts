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
    const maxGapMs = 1000; // If there is a gap > 1s, break the subtitle

    let i = 0;
    while (i < boundaries.length) {
      const chunk: WordBoundary[] = [];
      
      // Start a new chunk
      for (let j = 0; j < wordsPerSubtitle && (i + j) < boundaries.length; j++) {
        const currentWord = boundaries[i + j];
        if (!currentWord) break;

        // If this is not the first word of the chunk, check gap with previous word
        const prevWord: WordBoundary | undefined = chunk[chunk.length - 1];
        if (prevWord) {
          const gap = currentWord.audioOffset - (prevWord.audioOffset + (prevWord.duration || 0));
          
          if (gap > maxGapMs) {
            // Large gap detected, finish this chunk early
            break;
          }
        }
        
        chunk.push(currentWord);
      }

      const firstWord = chunk[0];
      const lastWord = chunk[chunk.length - 1];
      
      if (firstWord && lastWord) {
        const startTime = this.formatSrtTime(firstWord.audioOffset);
        const endTime = this.formatSrtTime(lastWord.audioOffset + (lastWord.duration || 0));
        
        // Clean text: remove most punctuation except '?'
        // Using a regex that keeps alphanumeric, spaces, and '?'
        // We also want to keep Chinese characters (\u4e00-\u9fa5)
        const rawText = chunk.map(b => b.text).join('');
        
        // Remove: , . ! ; : ， 。 ！ ； ： and other common marks
        // Keep: ? ？ and letters/numbers/spaces
        const cleanedText = rawText
          .replace(/[，。！；：,.!;:]/g, ' ') // Replace common marks with space
          .trim()
          .replace(/\s+/g, ' '); // Normalize spaces

        if (cleanedText) {
          srt += `${index}\n`;
          srt += `${startTime} --> ${endTime}\n`;
          srt += `${cleanedText}\n\n`;
          index++;
        }
      }

      i += chunk.length;
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
