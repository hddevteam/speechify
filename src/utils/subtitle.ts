import { WordBoundary } from '../types';
import * as fs from 'fs';

export class SubtitleUtils {
  private static readonly STRONG_BREAK_PUNCTUATION = /[。！？!?]/;
  private static readonly WEAK_BREAK_PUNCTUATION = /[；;：:]/;
  private static readonly COMMA_BREAK_PUNCTUATION = /[，,]/;
  private static readonly SENTENCE_END_PUNCTUATION = /[。！？!?]/;
  private static readonly DISPLAY_STRIP_PUNCTUATION = /[，。！；：,.!;:]/g;

  /**
   * Merge boundaries from multiple segments and enforce a hard break between segments
   * when previous segment does not end with sentence punctuation.
   */
  public static mergeSegmentBoundariesForSrt(segmentBoundaryGroups: WordBoundary[][]): WordBoundary[] {
    const merged: WordBoundary[] = [];

    for (const group of segmentBoundaryGroups) {
      if (!group || group.length === 0) {
        continue;
      }

      const lastBoundary = merged[merged.length - 1];
      if (lastBoundary && !this.endsWithSentencePunctuation(lastBoundary.text)) {
        const separatorOffset = lastBoundary.audioOffset + (lastBoundary.duration || 0);
        merged.push({
          text: '。',
          audioOffset: separatorOffset,
          duration: 0
        });
      }

      merged.push(...group);
    }

    return merged;
  }

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

        if (this.shouldBreakAtPunctuation(currentWord.text, chunk.length, wordsPerSubtitle)) {
          break;
        }
      }

      const firstWord = chunk[0];
      const lastWord = chunk[chunk.length - 1];
      
      if (firstWord && lastWord) {
        const startTime = this.formatSrtTime(firstWord.audioOffset);
        const endTime = this.formatSrtTime(lastWord.audioOffset + (lastWord.duration || 0));
        
        const chunkText = this.buildChunkText(chunk);
        const cleanedText = this.stripDisplayPunctuation(chunkText);

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

  private static shouldBreakAtPunctuation(token: string, chunkLength: number, wordsPerSubtitle: number): boolean {
    if (this.STRONG_BREAK_PUNCTUATION.test(token)) {
      return true;
    }

    const commaBreakThreshold = Math.max(4, Math.ceil(wordsPerSubtitle / 2));
    if (chunkLength >= commaBreakThreshold && this.COMMA_BREAK_PUNCTUATION.test(token)) {
      return true;
    }

    const weakBreakThreshold = Math.max(3, Math.ceil(wordsPerSubtitle / 2));
    return chunkLength >= weakBreakThreshold && this.WEAK_BREAK_PUNCTUATION.test(token);
  }

  private static buildChunkText(chunk: WordBoundary[]): string {
    const merged = chunk
      .map(boundary => (boundary.text || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');

    return merged
      .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
      .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static stripDisplayPunctuation(text: string): string {
    return text
      .replace(this.DISPLAY_STRIP_PUNCTUATION, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static endsWithSentencePunctuation(text: string): boolean {
    return this.SENTENCE_END_PUNCTUATION.test((text || '').trim());
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
