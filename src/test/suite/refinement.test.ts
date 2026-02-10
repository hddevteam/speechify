import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { VideoAnalyzer, TimingSegment } from '../../utils/videoAnalyzer';
import { ConfigManager } from '../../utils/config';

suite('Refine Script Word Count Test', () => {
    const timingJsonPath = '/Users/ming/projects/short-video-generate/2026-02-05-extra-0014-script/RPReplay_Final1770268194_vision_project/timing.json';
    const analyzer = new VideoAnalyzer();

    test('Should refine script based on word count instead of characters', async () => {
        if (!fs.existsSync(timingJsonPath)) {
            console.log('Skipping test - timing.json not found at:', timingJsonPath);
            return;
        }

        const visionConfig = ConfigManager.getVisionConfig();
        if (!visionConfig.apiKey) {
            console.log('Skipping test - Vision API Key not configured');
            return;
        }

        const segments: TimingSegment[] = JSON.parse(fs.readFileSync(timingJsonPath, 'utf-8'));
        const videoDuration = 85; // Roughly based on the segments

        console.log('Starting refinement test with word-based limits...');
        const refinedSegments = await analyzer.refineScript(
            segments,
            videoDuration,
            visionConfig.apiKey,
            visionConfig.endpoint,
            visionConfig.refinementDeployment || visionConfig.deployment
        );

        assert.ok(refinedSegments.length > 0, 'Should return refined segments');
        
        refinedSegments.forEach((seg, i) => {
            const wordCount = analyzer.countWords(seg.adjustedContent || '');
            const duration = seg.durationLimit || 1;
            const WORDS_PER_SECOND = 2.5;
            const maxWords = Math.max(3, Math.floor(duration * WORDS_PER_SECOND));

            console.log(`Segment ${i}: "${seg.title}"`);
            console.log(` - Duration: ${duration.toFixed(1)}s`);
            console.log(` - Max Words: ${maxWords}`);
            console.log(` - Result Words: ${wordCount}`);
            console.log(` - Content: ${seg.adjustedContent}`);

            if (i < refinedSegments.length - 1) { // Skip last segment check as per requirement
                assert.ok(wordCount <= maxWords, `Segment ${i} ("${seg.title}") word count (${wordCount}) exceeds limit (${maxWords})`);
            }
            assert.ok((seg.adjustedContent || '').length > 0, `Segment ${i} should not have empty content`);
        });

        // Save result for manual inspection
        const outputPath = path.join(path.dirname(timingJsonPath), 'test_refined_timing_words.json');
        fs.writeFileSync(outputPath, JSON.stringify(refinedSegments, null, 2));
        console.log('Refined result saved to:', outputPath);
    });
});
