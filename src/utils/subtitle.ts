import { WordBoundary } from '../types';
import * as fs from 'fs';

export class SubtitleUtils {
  private static readonly STRONG_BREAK_PUNCTUATION = /[。！？!?]/;
  private static readonly SENTENCE_END_PUNCTUATION = /[。！？!?]/;
  private static readonly DROP_DISPLAY_PUNCTUATION = /[，。；、,.;]/g;
  private static readonly MAX_WORDS_PER_SUBTITLE = 40;
  private static readonly MAX_GAP_MS = 1000;

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
    type SubtitleEntry = {
      startTime: string;
      endTime: string;
      text: string;
    };

    const entries: SubtitleEntry[] = [];

    let i = 0;
    while (i < boundaries.length) {
      const chunk: WordBoundary[] = [];
      
      // Start a new chunk
      for (let j = 0; j < this.MAX_WORDS_PER_SUBTITLE && (i + j) < boundaries.length; j++) {
        const currentWord = boundaries[i + j];
        if (!currentWord) break;

        // If this is not the first word of the chunk, check gap with previous word
        const prevWord: WordBoundary | undefined = chunk[chunk.length - 1];
        if (prevWord) {
          const gap = currentWord.audioOffset - (prevWord.audioOffset + (prevWord.duration || 0));
          
          if (gap > this.MAX_GAP_MS) {
            // Large gap detected, finish this chunk early
            break;
          }
        }
        
        chunk.push(currentWord);

        if (this.shouldBreakAtPunctuation(currentWord.text, chunk.length, this.MAX_WORDS_PER_SUBTITLE)) {
          break;
        }
      }

      const firstWord = chunk[0];
      const lastWord = chunk[chunk.length - 1];
      
      if (firstWord && lastWord) {
        const startTime = this.formatSrtTime(firstWord.audioOffset);
        const endTime = this.formatSrtTime(lastWord.audioOffset + (lastWord.duration || 0));
        
        const chunkText = this.buildChunkText(chunk);
        if (chunkText) {
          if (this.isPunctuationOnlyText(chunkText)) {
            const prevEntry = entries[entries.length - 1];
            if (prevEntry) {
              prevEntry.text = `${prevEntry.text}${chunkText}`;
              prevEntry.endTime = endTime;
            }
          } else {
            entries.push({ startTime, endTime, text: this.normalizeSubtitleText(chunkText) });
          }
        }
      }

      i += chunk.length;
    }

    return entries
      .map((entry, idx) => `${idx + 1}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}`)
      .join('\n\n')
      .concat(entries.length > 0 ? '\n\n' : '');
  }

  private static shouldBreakAtPunctuation(token: string, chunkLength: number, wordsPerSubtitle: number): boolean {
    if (this.STRONG_BREAK_PUNCTUATION.test(token)) {
      return true;
    }

    return chunkLength >= wordsPerSubtitle;
  }

  private static buildChunkText(chunk: WordBoundary[]): string {
    const merged = chunk
      .map(boundary => (boundary.text || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');

    return merged
      .replace(/([“‘])\s+/g, '$1')
      .replace(/\s+([”’])/g, '$1')
      .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static isPunctuationOnlyText(text: string): boolean {
    const nonPunctuation = text.replace(/[\s\p{P}\p{S}]/gu, '');
    return nonPunctuation.length === 0;
  }

  private static normalizeSubtitleText(text: string): string {
    return text
      .replace(this.DROP_DISPLAY_PUNCTUATION, ' ')
      .replace(/\s*([！？!?])/g, '$1')
      .replace(/([“‘])\s+/g, '$1')
      .replace(/\s+([”’])/g, '$1')
      .replace(/([！？!?])\s+(?=[\u4e00-\u9fffA-Za-z0-9])/g, '$1')
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
