import * as assert from 'assert';
import * as fs from 'fs';
import { SpeechService } from '../../services/speechService';

suite('Full Vision Alignment Integration Test', () => {
    const videoPath = '/Users/ming/projects/short-video-generate/2026-02-05-extra-0014-script/RPReplay_Final1770268194.MP4';
    const scriptPath = '/Users/ming/projects/short-video-generate/2026-02-05-extra-0014-script/audio-script.txt';

    test('Should perform full conversion with vision alignment', async function() {
        this.timeout(600000); // 10 minutes for full conversion

        if (!fs.existsSync(videoPath) || !fs.existsSync(scriptPath)) {
            console.log('Skipping test: Input files not found');
            this.skip();
            return;
        }

        const script = fs.readFileSync(scriptPath, 'utf8');
        
        try {
            console.log('Starting full vision alignment conversion...');
            
            // Ensure we use a valid voice for the test
            const config = require('vscode').workspace.getConfiguration('speechify');
            await config.update('voiceName', 'zh-CN-YunyangNeural', true);
            await config.update('voiceStyle', 'friendly', true);
            
            const result = await SpeechService.convertToVideoWithVision(script, scriptPath, videoPath);
            
            console.log('Conversion Result:', result.success);
            console.log('Video Output:', result.videoOutputPath);
            
            assert.ok(result.success);
            assert.ok(result.videoOutputPath);
            assert.ok(fs.existsSync(result.videoOutputPath));
            
            // Check if SRT exists
            const srtPath = result.outputPaths.find(p => p.endsWith('.srt'));
            assert.ok(srtPath && fs.existsSync(srtPath), 'SRT file should exist');
            
        } catch (error) {
            console.error('Full conversion test failed:', error);
            assert.fail('Full conversion test failed: ' + error);
        }
    });
});
