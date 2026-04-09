import * as assert from 'assert';
import { AzureSpeechService } from '../../utils/azure';

suite('AzureSpeechService.splitTextIntoChunks', () => {
    test('should return single chunk for short text', () => {
        const text = 'Hello world.';
        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0], text);
    });

    test('should return single chunk for text exactly at the limit', () => {
        const text = 'a'.repeat(3000);
        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        assert.strictEqual(chunks.length, 1);
    });

    test('should split text over 3000 chars into multiple chunks', () => {
        // Build text > 3000 chars with distinct newline-separated lines
        const line = '这是一段用于测试分块功能的中文文本内容，确保字符数足够触发分块逻辑。';
        const text = Array(100).fill(line).join('\n'); // ~35 chars/line × 100 + 99 newlines ≈ 3599 chars

        assert.ok(text.length > 3000, 'Precondition: test text must be > 3000 chars');

        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);
    });

    test('should split on newline boundaries, not mid-line', () => {
        // Create 5 lines, each ~600 chars (total ~3000+ chars)
        const line1 = '第一段落内容'.repeat(100); // ~600 chars
        const line2 = '第二段落内容'.repeat(100);
        const line3 = '第三段落内容'.repeat(100);
        const line4 = '第四段落内容'.repeat(100);
        const line5 = '第五段落内容'.repeat(100);
        const text = [line1, line2, line3, line4, line5].join('\n');

        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);

        // Each chunk's individual lines must be complete (not cut mid-line)
        for (const chunk of chunks) {
            const chunkLines = chunk.split('\n').filter(l => l.trim().length > 0);
            for (const chunkLine of chunkLines) {
                const len = chunkLine.trim().length;
                assert.ok(
                    len === line1.length,
                    `Found a partial line of length ${len}, expected ${line1.length}`
                );
            }
        }
    });

    test('should preserve all content across all chunks', () => {
        const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: ${'内容'.repeat(80)}`);
        const text = lines.join('\n');

        assert.ok(text.length > 3000, 'Precondition: test text must be > 3000 chars');

        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        const rejoined = chunks.join('\n');
        for (const line of lines) {
            assert.ok(rejoined.includes(line), `Missing line: "${line.substring(0, 30)}..."`);
        }
    });

    test('each chunk should not exceed the specified max size', () => {
        const line = '测试内容行'.repeat(20); // ~100 chars per line
        const text = Array(100).fill(line).join('\n');
        const maxSize = 3000;

        const chunks = AzureSpeechService.splitTextIntoChunks(text, maxSize);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i] ?? '';
            assert.ok(
                chunk.length <= maxSize,
                `Chunk ${i} has length ${chunk.length} exceeding max ${maxSize}`
            );
        }
    });

    test('should use 3000 as default max chunk size', () => {
        // Build text > 3000 but < 8000 chars — with old default of 8000 it would NOT split
        const line = '默认分块阈值测试内容行。';
        const text = Array(300).fill(line).join('\n'); // ~3900 chars, between 3000 and 8000

        assert.ok(text.length > 3000, 'Precondition: text must exceed 3000 chars');
        assert.ok(text.length < 8000, 'Precondition: text must be under old 8000 threshold');

        const chunks = AzureSpeechService.splitTextIntoChunks(text);

        assert.ok(
            chunks.length > 1,
            `With default size 3000, text of ${text.length} chars should produce multiple chunks, got ${chunks.length}`
        );
    });

    test('should handle empty text gracefully', () => {
        const chunks = AzureSpeechService.splitTextIntoChunks('', 3000);

        assert.strictEqual(chunks.length, 1);
        assert.strictEqual(chunks[0], '');
    });

    test('should handle text with no newlines exceeding chunk size', () => {
        // Single long line > 3000 chars
        const text = '无换行符的超长文本'.repeat(400); // ~3200 chars

        assert.ok(text.length > 3000, 'Precondition: must exceed 3000 chars');

        const chunks = AzureSpeechService.splitTextIntoChunks(text, 3000);

        // Should produce at least 1 chunk without crashing; content preserved
        assert.ok(chunks.length >= 1);
        const rejoined = chunks.join('');
        assert.strictEqual(rejoined, text);
    });
});
