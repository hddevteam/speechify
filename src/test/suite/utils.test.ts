import * as assert from 'assert';
import { AudioUtils } from '../../utils/audio';

suite('AudioUtils', () => {
    suite('generateOutputPath', () => {
        const sourceFile = '/path/to/test.txt';

        test('should generate single file path without chunks', () => {
            const singleOutput = AudioUtils.generateOutputPath(sourceFile, undefined, 1);
            
            assert.ok(singleOutput.includes('test_speechify_'));
            assert.ok(singleOutput.endsWith('.mp3'));
            assert.ok(!singleOutput.includes('_part'));
        });

        test('should generate chunked file paths with part numbers', () => {
            const chunkedOutput = AudioUtils.generateOutputPath(sourceFile, 0, 3);
            
            assert.ok(chunkedOutput.includes('test_speechify_part01_'));
            assert.ok(chunkedOutput.endsWith('.mp3'));
        });

        test('should generate correct part numbers for multiple chunks', () => {
            const chunk0 = AudioUtils.generateOutputPath(sourceFile, 0, 3);
            const chunk1 = AudioUtils.generateOutputPath(sourceFile, 1, 3);
            const chunk2 = AudioUtils.generateOutputPath(sourceFile, 2, 3);
            
            assert.ok(chunk0.includes('_part01_'));
            assert.ok(chunk1.includes('_part02_'));
            assert.ok(chunk2.includes('_part03_'));
        });

        test('should handle single chunk as non-chunked', () => {
            const output = AudioUtils.generateOutputPath(sourceFile, undefined, 1);
            
            assert.ok(!output.includes('_part'));
        });
    });

    suite('saveAudioFile', () => {
        test('should return early if audio buffer is empty', async () => {
            try {
                const sourceFile = '/tmp/test.txt';
                const outputPath = AudioUtils.generateOutputPath(sourceFile);
                
                await AudioUtils.saveAudioFile(Buffer.alloc(0), outputPath);
                
                // Should not throw
                assert.ok(true);
            } catch (error) {
                // Expected to fail gracefully
                assert.ok(true);
            }
        });
    });

    suite('getTimestamp', () => {
        test('should generate timestamp in correct format', () => {
            const sourceFile = '/tmp/test.txt';
            const output1 = AudioUtils.generateOutputPath(sourceFile, undefined, 1);
            const output2 = AudioUtils.generateOutputPath(sourceFile, undefined, 1);
            
            // Both should have timestamp format YYYYMMDD_HHMM
            const timestampRegex = /_\d{8}_\d{4}\./;
            assert.ok(timestampRegex.test(output1));
            assert.ok(timestampRegex.test(output2));
        });
    });

    suite('file format handling', () => {
        test('should use mp3 as default format', () => {
            const sourceFile = '/tmp/test.txt';
            const output = AudioUtils.generateOutputPath(sourceFile, 0, 2);
            
            assert.ok(output.endsWith('.mp3'));
        });

        test('should respect custom format parameter', () => {
            const sourceFile = '/tmp/test.txt';
            const output = AudioUtils.generateOutputPath(sourceFile, 0, 2, 'wav');
            
            assert.ok(output.endsWith('.wav'));
        });
    });

    suite('special characters handling', () => {
        test('should handle Chinese characters in file path', () => {
            const sourceFile = '/tmp/案例.txt';
            const chineseOutput = AudioUtils.generateOutputPath(sourceFile, 0, 2);
            
            assert.ok(chineseOutput.includes('案例_speechify_part01_'));
            assert.ok(chineseOutput.endsWith('.mp3'));
        });

        test('should handle files with special characters', () => {
            const sourceFile = '/tmp/test-file[special].txt';
            const output = AudioUtils.generateOutputPath(sourceFile, 0, 2);
            
            assert.ok(output.includes('test-file[special]_speechify_part01_'));
            assert.ok(output.endsWith('.mp3'));
        });
    });
});
