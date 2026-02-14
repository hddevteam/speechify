import * as assert from 'assert';
import * as fs from 'fs';
import { VideoAnalyzer } from '../../utils/videoAnalyzer';

suite('VideoAnalyzer Test Suite', () => {
    const testVideoPath = '/Users/ming/projects/short-video-generate/2026-02-10-ai-worker-oriented-scripts/录屏2026-02-10 09.50.06.mov';

    // When running targeted tests (e.g. refine-only), skip this slow suite entirely.
    const grep = process.env.MOCHA_GREP;
    if (grep && /Refine Script Word Count Test/i.test(grep)) {
        return;
    }
    
    test('extractFrames should return a list of image paths', async function() {
        this.timeout(60000); // Set timeout to 60 seconds for ffmpeg processing
        const analyzer = new VideoAnalyzer();
        // Since we want to extract roughly 10 frames for the 10 apps in ~300s, 
        // interval of 30s is reasonable. But let's use 10s for more precision.
        const frames = await analyzer.extractFrames(testVideoPath, 10);
        
        console.log(`Extracted ${frames.length} frames.`);
        assert.ok(Array.isArray(frames));
        assert.ok(frames.length > 0, 'No frames extracted');
        
        // Cleanup check
        frames.forEach(frame => {
            assert.ok(fs.existsSync(frame), `Frame file ${frame} does not exist`);
        });
    });

    test('analyzeTiming should return a structured JSON mapping', async function() {
        this.timeout(300000); // AI calls with many images can take a long time
        
        // Use ConfigManager to get keys instead of hardcoding
        const { apiKey, endpoint, deployment } = require('../../utils/config').ConfigManager.getVisionConfig();
        
        if (!apiKey || !endpoint) {
            console.log('Skipping analyzeTiming test: API keys not found in config');
            this.skip();
            return;
        }
        
        const analyzer = new VideoAnalyzer();
        const script = fs.readFileSync('/Users/ming/projects/short-video-generate/2026-02-10-ai-worker-oriented-scripts/audio-script.txt', 'utf8');
        const totalDuration = await analyzer.getVideoDuration(testVideoPath);
        
        // Extract real frames first
        const allFrames = await analyzer.extractFrames(testVideoPath, 30); // 30s interval to keep image count low for the test
        console.log(`Analyzing ${allFrames.length} frames for timing...`);
        
        try {
            const timing = await analyzer.analyzeTiming(allFrames, script, totalDuration, apiKey, endpoint, deployment);
            console.log('AI Timing Result:', JSON.stringify(timing, null, 2));
            assert.ok(timing);
            assert.ok(Array.isArray(timing.segments));
            assert.ok(timing.segments.length > 0);
        } catch (error) {
            assert.fail('analyzeTiming failed: ' + error);
        }
    });
});
