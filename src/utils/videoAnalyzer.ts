import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import axios from 'axios';

const execAsync = promisify(exec);

export interface TimingSegment {
    startTime: number;
    title: string;
    content: string;
    durationLimit?: number;
    adjustedContent?: string;
    audioPath?: string;
}

export interface VisionTimingResult {
    segments: TimingSegment[];
}

export class VideoAnalyzer {
    /**
     * Count words in a string (handles Chinese characters and English words)
     */
    public countWords(text: string): number {
        if (!text) return 0;
        const normalized = text.trim();

        // Count all Han characters (covers CJK Unified Ideographs beyond \u9fa5)
        const hanCount = normalized.match(/\p{Script=Han}/gu)?.length ?? 0;

        // Count alphanumeric “words” outside Han scripts
        const latinWords = normalized
            .replace(/\p{Script=Han}/gu, ' ')
            .match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g)?.length ?? 0;

        return hanCount + latinWords;
    }

    private sanitizeRefinedText(text: string): string {
        let t = (text ?? '').trim();
        if (!t) return '';

        // Remove surrounding quotes if any
        t = t.replace(/^"|"$/g, '').trim();

        // Hard ban ellipses (both ASCII and Unicode)
        t = t
            .replace(/\.{3,}/g, '')
            .replace(/[\u2026\u22EF]+/g, '') // … ⋯
            .replace(/[。.!?！？]+\s*$/g, (m) => m.trim());

        // Clean up repeated spaces
        t = t.replace(/\s+/g, ' ').trim();

        // Avoid ending with weak punctuation that sounds like truncation
        t = t.replace(/[，,、:：]\s*$/g, '').trim();

        return t;
    }

    /**
     * Get video duration in seconds
     */
    public async getVideoDuration(videoPath: string): Promise<number> {
        try {
            const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`);
            return parseFloat(stdout.trim());
        } catch (error) {
            console.error('Failed to get video duration:', error);
            return 60; // Default fallback
        }
    }

    /**
     * Extract frames from video at specified intervals
     */
    public async extractFrames(videoPath: string, intervalSeconds: number): Promise<string[]> {
        const tempDir = path.join(os.tmpdir(), 'speechify-frames-' + Date.now());
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const outputPattern = path.join(tempDir, 'frame-%03d.jpg');
        const fps = 1 / intervalSeconds;

        try {
            // Using ffmpeg to extract frames
            // -vf "fps=1/N" extracts one frame every N seconds
            const command = `ffmpeg -i "${videoPath}" -vf "fps=${fps}" -q:v 2 "${outputPattern}"`;
            await execAsync(command);

            const files = fs.readdirSync(tempDir)
                .filter(file => file.endsWith('.jpg'))
                .sort()
                .map(file => path.join(tempDir, file));

            return files;
        } catch (error) {
            console.error('Failed to extract frames:', error);
            throw error;
        }
    }

    /**
     * Analyze frame timings using AI
     * @param frames Array of image paths
     * @param script The original script content
     * @param apiKey Azure OpenAI API Key
     * @param endpoint Azure OpenAI Endpoint
     * @param deployment GPT-5.2 deployment name
     * @returns JSON mapping of script segments to time offsets
     */
    public async analyzeTiming(
        frames: string[], 
        script: string, 
        apiKey: string, 
        endpoint: string,
        deployment: string
    ): Promise<any> {
        const userContent: any[] = [
            {
                type: 'text',
                text: `Here is the script: \n\n${script}\n\nPlease analyze these frames (captured every 10s) and tell me which parts of the script correspond to which timestamps in the video. Return a JSON object with a "segments" array. Each segment should have "startTime" (seconds), "title" (app name), and "content" (the relevant script text).`
            }
        ];

        // Add frames to the user message
        for (const framePath of frames) {
            const base64Image = fs.readFileSync(framePath).toString('base64');
            userContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                }
            });
        }

        const messages = [
            {
                role: 'system',
                content: 'You are an expert video editor and AI assistant. Your task is to align a narration script with a screen recording. You will be given frames extracted every 10 seconds from the video. Identify the timestamps where the visual content changes to a new topic (specifically new App prototypes in this case) and map the script segments accordingly.'
            },
            {
                role: 'user',
                content: userContent
            }
        ];

        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
        
        try {
            const response = await axios.post(url, {
                messages,
                response_format: { type: "json_object" },
                max_completion_tokens: 4096
            }, {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });

            // The content might be a string that needs parsing if not using response_format correctly
            // or if the SDK returns it as a string. Azure OpenAI often returns a string.
            let content = response.data.choices[0].message.content;
            if (typeof content === 'string') {
                // Remove markdown code blocks if present
                content = content.replace(/```json\n?|```/g, '').trim();
                if (!content) {
                    throw new Error('AI returned an empty response content');
                }
                try {
                    return JSON.parse(content);
                } catch (e) {
                    console.error('Failed to parse AI response as JSON:', content);
                    throw new Error(`Invalid JSON response from AI: ${content.substring(0, 100)}...`);
                }
            }
            return content;
        } catch (error: any) {
            console.error('AI analysis failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Refine script to fit duration limits
     */
    public async refineScript(
        segments: TimingSegment[],
        videoDuration: number,
        apiKey: string,
        endpoint: string,
        deployment: string,
        wordsPerSecond: number = 2.5
    ): Promise<TimingSegment[]> {
        const refinedSegments: TimingSegment[] = [];
        const WORDS_PER_SECOND = wordsPerSecond;
        const MAX_RETRIES = 3;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (!seg) continue;
            
            const nextSeg = i < segments.length - 1 ? segments[i + 1] : undefined;
            const nextStartTime = nextSeg ? nextSeg.startTime : videoDuration;
            const durationLimit = Math.max(1.0, nextStartTime - seg.startTime); // Ensure at least 1 second
            
            // Calculate max words based on time
            const maxWords = Math.max(3, Math.floor(durationLimit * WORDS_PER_SECOND)); 
            const currentWords = this.countWords(seg.content);
            
            seg.durationLimit = durationLimit;

            // SPECIAL CASE: Last segment doesn't need refinement (user will extend video end)
            // Also skip if content is already short enough in words
            if (!nextSeg || currentWords <= maxWords) {
                seg.adjustedContent = seg.content;
                refinedSegments.push(seg);
                continue;
            }

            let currentContent = seg.content;
            let success = false;

            for (let retry = 1; retry <= MAX_RETRIES; retry++) {
                const words = this.countWords(currentContent);
                console.log(`Refining segment ${i} (Try ${retry}): "${seg.title}" (Limit: ${durationLimit.toFixed(1)}s, Max Words: ${maxWords}, Current: ${words}, WPS: ${WORDS_PER_SECOND.toFixed(2)})`);

                const prompt = `You are a script condensation expert. Your goal is to REWRITE and PARAPHRASE the following segment to fit a specific timing.
DO NOT just truncate or cut off the text. Instead, compress the meaning by using more concise phrasing and summarizing key points.

CURRENT TEXT: "${currentContent}"
MAX WORD LIMIT: ${maxWords} units (Each Chinese character or English word counts as 1).

REQUIREMENTS:
1. The "refinedText" MUST NOT exceed ${maxWords} units.
2. Maintain the core message, impact, and conversational tone.
3. DO NOT just remove the end of the text. Rewrite the whole thing to be punchy.
4. Output as JSON only.
5. IMPORTANT: DO NOT use ellipses (...) or truncated symbols. The sentences MUST be complete and natural.

JSON FORMAT:
{
  "refinedText": "your rewritten concise text here",
  "originalMeaningRetained": true,
  "wordCount": total_count
}`;

                const messages = [
                    { role: 'system', content: 'You are a professional video script editor. Summarize the text to be strictly within word limits. Output ONLY the JSON object. Do not explain your reasoning.' },
                    { role: 'user', content: prompt }
                ];

                const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
                
                try {
                    const response = await axios.post(url, {
                        messages,
                        response_format: { type: "json_object" },
                        max_completion_tokens: 2000
                    }, {
                        headers: {
                            'api-key': apiKey,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000 // 30s timeout per call
                    });

                    let rawContent = response.data.choices[0].message.content;
                    if (!rawContent) {
                        throw new Error('AI returned empty content');
                    }

                    let content;
                    try {
                        content = JSON.parse(rawContent);
                    } catch (e) {
                        console.error('Failed to parse AI response as JSON. Raw content:', rawContent);
                        throw e;
                    }
                    
                    const refinedResult = this.sanitizeRefinedText(content.refinedText);
                    const refinedWords = this.countWords(refinedResult);
                    
                    if (refinedWords > 0 && refinedWords <= maxWords) {
                        console.log(`Successfully refined to: "${refinedResult}" (${refinedWords} words)`);
                        seg.adjustedContent = refinedResult;
                        success = true;
                        break;
                    } else if (refinedWords > 0) {
                        console.warn(`Attempt ${retry} failed: Result too long (${refinedWords} words > ${maxWords}). Retrying...`);
                        currentContent = refinedResult; 
                    }
                } catch (error: any) {
                    console.error(`Refinement API error on attempt ${retry}:`, error.message);
                }
            }

            if (!success) {
                console.error(`Failed to refine segment ${i} after ${MAX_RETRIES} attempts. Fallback to hard truncation.`);
                
                // Better fallback: Try to keep at least 90% of maxWords if original is very long
                // but ensure we don't exceed maxWords and don't end with unfinished thoughts if possible
                const text = seg.content;
                const chars = text.split('');
                const safeLimit = Math.min(chars.length, maxWords);
                
                // Try to find a sentence ender or punctuation within the limit
                let bestLimit = safeLimit;
                const searchRegion = text.substring(0, safeLimit);
                const lastStrongPunctuation = Math.max(
                    searchRegion.lastIndexOf('。'),
                    searchRegion.lastIndexOf('.'),
                    searchRegion.lastIndexOf('！'),
                    searchRegion.lastIndexOf('!'),
                    searchRegion.lastIndexOf('？'),
                    searchRegion.lastIndexOf('?'),
                    searchRegion.lastIndexOf('；'),
                    searchRegion.lastIndexOf(';')
                );

                const lastWeakPunctuation = Math.max(
                    searchRegion.lastIndexOf('，'),
                    searchRegion.lastIndexOf(','),
                    searchRegion.lastIndexOf('、'),
                    searchRegion.lastIndexOf('：'),
                    searchRegion.lastIndexOf(':')
                );

                if (lastStrongPunctuation > safeLimit * 0.5) {
                    bestLimit = lastStrongPunctuation + 1;
                } else if (lastWeakPunctuation > safeLimit * 0.7) {
                    bestLimit = lastWeakPunctuation + 1;
                }

                seg.adjustedContent = this.sanitizeRefinedText(text.substring(0, bestLimit));
            }
            
            refinedSegments.push(seg);
        }

        return refinedSegments;
    }
}
