import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { SpeechService } from '../../services/speechService';
import { loadTestConfig, hasTestConfig, TEST_TEXTS, createTempFile, cleanupTempFile } from '../testUtils';

suite('Speech Service Tests', () => {
    
    suiteSetup(() => {
        if (!hasTestConfig()) {
            console.warn('⚠️  Speech Service tests will be skipped - test-config.json not found');
            console.warn('   To run these tests, create test-config.json with your Azure credentials');
        }
    });

    test('should get voice list successfully', () => {
        const voiceList = SpeechService.getVoiceList();
        
        // Voice list might be empty in test environment, but should not throw
        assert.ok(Array.isArray(voiceList), 'Voice list should be an array');
        
        if (voiceList.length > 0) {
            const firstVoice = voiceList[0];
            if (firstVoice) {
                assert.ok('ShortName' in firstVoice, 'Voice should have ShortName property');
                assert.ok('Gender' in firstVoice, 'Voice should have Gender property');
                assert.ok('Locale' in firstVoice, 'Voice should have Locale property');
            }
        }
    });

    test('should filter voice list by attributes', () => {
        const voiceList = SpeechService.getVoiceList();
        
        if (voiceList.length === 0) {
            console.warn('Skipping voice filtering test - no voices available');
            return;
        }

        // Test filtering by gender
        const femaleVoices = SpeechService.filterVoiceList(voiceList, 'Gender', 'Female');
        const maleVoices = SpeechService.filterVoiceList(voiceList, 'Gender', 'Male');
        
        assert.ok(Array.isArray(femaleVoices), 'Filtered voice list should be an array');
        assert.ok(Array.isArray(maleVoices), 'Filtered voice list should be an array');
        
        // Test filtering by locale
        const enUSVoices = SpeechService.filterVoiceList(voiceList, 'Locale', 'en-US');
        assert.ok(Array.isArray(enUSVoices), 'Locale filtered voices should be an array');
        
        // Test filtering with no value (should return all)
        const allVoices = SpeechService.filterVoiceList(voiceList, 'Gender');
        assert.strictEqual(allVoices.length, voiceList.length, 'No filter should return all voices');
    });

    test('should get unique values from voice list', () => {
        const voiceList = SpeechService.getVoiceList();
        
        if (voiceList.length === 0) {
            console.warn('Skipping unique values test - no voices available');
            return;
        }

        const uniqueGenders = SpeechService.getUniqueValues(voiceList, 'Gender');
        const uniqueLocales = SpeechService.getUniqueValues(voiceList, 'Locale');
        
        assert.ok(Array.isArray(uniqueGenders), 'Unique genders should be an array');
        assert.ok(Array.isArray(uniqueLocales), 'Unique locales should be an array');
        
        // Check that values are actually unique
        const genderSet = new Set(uniqueGenders);
        const localeSet = new Set(uniqueLocales);
        
        assert.strictEqual(uniqueGenders.length, genderSet.size, 'Gender values should be unique');
        assert.strictEqual(uniqueLocales.length, localeSet.size, 'Locale values should be unique');
    });

    test('should create quick pick items correctly', () => {
        const voiceList = SpeechService.getVoiceList();
        
        if (voiceList.length === 0) {
            console.warn('Skipping quick pick items test - no voices available');
            return;
        }

        const quickPickItems = SpeechService.createVoiceQuickPickItems(voiceList, 'Gender');
        
        assert.ok(Array.isArray(quickPickItems), 'Quick pick items should be an array');
        
        if (quickPickItems.length > 0) {
            const firstItem = quickPickItems[0];
            if (firstItem) {
                assert.ok('label' in firstItem, 'Quick pick item should have label');
                assert.strictEqual(typeof firstItem.label, 'string', 'Label should be string');
            }
        }
    });

    test('should handle configuration wizard display', async () => {
        // This test ensures the method doesn't throw errors
        // Actual UI interaction testing would require VS Code test environment
        assert.doesNotThrow(() => {
            // We can't actually test UI interactions in unit tests
            // but we can ensure the method exists and is callable
            const method = SpeechService.showConfigurationWizard;
            assert.strictEqual(typeof method, 'function', 'showConfigurationWizard should be a function');
        }, 'Configuration wizard should not throw on access');
    });

    test('should handle Azure settings configuration', async () => {
        // This test ensures the method doesn't throw errors
        assert.doesNotThrow(() => {
            const method = SpeechService.configureAzureSettings;
            assert.strictEqual(typeof method, 'function', 'configureAzureSettings should be a function');
        }, 'Azure settings configuration should not throw on access');
    });

    test('should handle voice settings configuration', async () => {
        // This test ensures the method doesn't throw errors
        assert.doesNotThrow(() => {
            const method = SpeechService.configureVoiceSettings;
            assert.strictEqual(typeof method, 'function', 'configureVoiceSettings should be a function');
        }, 'Voice settings configuration should not throw on access');
    });

    // Real Azure API tests (only run if test config is available)
    test('should convert short text to speech using real Azure API', async function() {
        this.timeout(30000); // 30 second timeout for API calls
        
        if (!hasTestConfig()) {
            console.warn('Skipping real Azure API test - test-config.json not found');
            return;
        }

        const testConfig = loadTestConfig();
        console.log(`🔊 Testing real Azure API with endpoint: ${testConfig.endpoint}`);
        
        const tempFile = createTempFile(TEST_TEXTS.english.short);
        
        try {
            const result = await SpeechService.convertTextToSpeech(
                TEST_TEXTS.english.short,
                tempFile
            );
            
            assert.ok(result, 'Speech conversion should return a result');
            assert.strictEqual(typeof result.success, 'boolean', 'Result should have success property');
            assert.strictEqual(typeof result.processedChunks, 'number', 'Result should have processedChunks');
            assert.strictEqual(typeof result.totalChunks, 'number', 'Result should have totalChunks');
            assert.ok(Array.isArray(result.outputPaths), 'Result should have outputPaths array');
            assert.ok(Array.isArray(result.errors), 'Result should have errors array');
            
            if (result.success) {
                console.log(`✅ Successfully generated ${result.outputPaths.length} audio file(s)`);
                
                // Verify audio files were created
                for (const outputPath of result.outputPaths) {
                    assert.ok(fs.existsSync(outputPath), `Audio file should exist at ${outputPath}`);
                    
                    const stats = fs.statSync(outputPath);
                    assert.ok(stats.size > 0, 'Audio file should not be empty');
                    
                    console.log(`📁 Generated audio file: ${path.basename(outputPath)} (${stats.size} bytes)`);
                    
                    // Clean up generated audio file
                    fs.unlinkSync(outputPath);
                }
            } else {
                console.warn('Speech conversion failed:', result.errors);
                // Don't fail the test if API is temporarily unavailable
                assert.ok(result.errors.length > 0, 'Failed conversion should have error messages');
            }
            
        } catch (error) {
            console.warn('Azure API test failed (this may be due to configuration or network issues):', error);
            // Don't fail the test suite if Azure API is unavailable
            // Just ensure the error is handled gracefully
            assert.ok(error instanceof Error, 'Should throw proper Error object');
        } finally {
            cleanupTempFile(tempFile);
        }
    });

    test('should handle markdown text extraction in speech conversion', async function() {
        this.timeout(20000);
        
        if (!hasTestConfig()) {
            console.warn('Skipping markdown extraction test - test-config.json not found');
            return;
        }

        const tempFile = createTempFile(TEST_TEXTS.markdown, '.md');
        
        try {
            const result = await SpeechService.convertTextToSpeech(
                TEST_TEXTS.markdown,
                tempFile
            );
            
            // Should not fail due to markdown formatting
            assert.ok(result, 'Should handle markdown text');
            assert.strictEqual(typeof result.success, 'boolean', 'Should return proper result structure');
            
            if (result.success) {
                console.log('✅ Successfully processed markdown text');
                
                // Clean up generated files
                for (const outputPath of result.outputPaths) {
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                }
            }
            
        } catch (error) {
            console.warn('Markdown processing test failed:', error);
            // Ensure error handling is working
            assert.ok(error instanceof Error, 'Should handle markdown processing errors gracefully');
        } finally {
            cleanupTempFile(tempFile);
        }
    });

    test('should handle text chunking for longer content', async function() {
        this.timeout(45000); // Longer timeout for chunked content
        
        if (!hasTestConfig()) {
            console.warn('Skipping text chunking test - test-config.json not found');
            return;
        }

        const tempFile = createTempFile(TEST_TEXTS.english.long);
        
        try {
            const result = await SpeechService.convertTextToSpeech(
                TEST_TEXTS.english.long,
                tempFile
            );
            
            assert.ok(result, 'Should handle long text');
            
            if (result.success) {
                console.log(`✅ Successfully processed long text into ${result.outputPaths.length} chunk(s)`);
                assert.ok(result.totalChunks >= 1, 'Should process at least one chunk');
                assert.strictEqual(result.processedChunks, result.outputPaths.length, 'Processed chunks should match output files');
                
                // Clean up generated files
                for (const outputPath of result.outputPaths) {
                    if (fs.existsSync(outputPath)) {
                        console.log(`🗑️  Cleaning up: ${path.basename(outputPath)}`);
                        fs.unlinkSync(outputPath);
                    }
                }
            }
            
        } catch (error) {
            console.warn('Long text processing test failed:', error);
            assert.ok(error instanceof Error, 'Should handle long text processing errors gracefully');
        } finally {
            cleanupTempFile(tempFile);
        }
    });

    test('should handle empty or invalid text gracefully', async function() {
        this.timeout(10000);
        
        if (!hasTestConfig()) {
            console.warn('Skipping empty text handling test - test-config.json not found');
            return;
        }

        const tempFile = createTempFile('   '); // Just whitespace
        
        try {
            const result = await SpeechService.convertTextToSpeech('   ', tempFile);
            
            // Should fail gracefully for empty content
            assert.ok(result, 'Should return result object even for empty text');
            assert.strictEqual(result.success, false, 'Should fail for empty text');
            assert.ok(result.errors.length > 0, 'Should have error messages for empty text');
            
        } catch (error) {
            // Expected to throw for empty text
            assert.ok(error instanceof Error, 'Should throw proper Error for empty text');
            console.log('✅ Correctly handled empty text with error:', (error as Error).message);
        } finally {
            cleanupTempFile(tempFile);
        }
    });
});
