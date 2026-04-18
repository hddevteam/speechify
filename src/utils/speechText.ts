import { WordBoundary } from '../types';

export class SpeechTextUtils {
  public static splitTextIntoChunks(text: string, maxChunkSize: number = 3000): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    const lines = text.split(/\n/);
    let currentChunk = '';

    for (const line of lines) {
      const candidate = currentChunk ? `${currentChunk}\n${line}` : line;

      if (candidate.length > maxChunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = line;
      } else {
        currentChunk = candidate;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  public static extractTextFromMarkdown(markdown: string): string {
    const noCodeBlocks = markdown.replace(/```[\s\S]*?```/g, '');
    const noHeaders = noCodeBlocks.replace(/^#{1,6}\s+/gm, '');

    return noHeaders
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  public static approximateBoundaries(text: string, durationMs: number): WordBoundary[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return [];
    }

    const segments = normalized
      .split(/(?<=[。！？!?；;，,])\s*|\n+/)
      .map(segment => segment.trim())
      .filter(Boolean);

    const chunks = segments.length > 0 ? segments : [normalized];
    const weights = chunks.map(chunk => Math.max(1, chunk.replace(/\s+/g, '').length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    let offset = 0;
    return chunks.map((chunk, index) => {
      const weight = weights[index] || 1;
      const remaining = Math.max(0, durationMs - offset);
      const isLast = index === chunks.length - 1;
      const chunkDuration = isLast
        ? remaining
        : Math.max(120, Math.round((durationMs * weight) / Math.max(1, totalWeight)));

      const boundary = {
        text: chunk,
        audioOffset: offset,
        duration: isLast ? remaining : chunkDuration
      };

      offset += boundary.duration;
      return boundary;
    });
  }
}
