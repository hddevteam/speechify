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
    audioDuration?: number;
}

export interface TimingProject {
    version: string;
    videoName: string;
    videoPath?: string;
    lastModified: string;
    segments: TimingSegment[];
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
     * Extract frames in a specific time range
     */
    public async extractFramesInRange(videoPath: string, start: number, duration: number, fps: number = 1): Promise<string[]> {
        const tempDir = path.join(os.tmpdir(), `speechify-refine-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const outputPattern = path.join(tempDir, 'refine-%03d.jpg');
        
        try {
            // Sanity check for duration
            if (duration <= 0) return [];

            // -ss is fast seek before -i
            // -t is duration
            const command = `ffmpeg -ss ${start} -t ${duration} -i "${videoPath}" -vf "fps=${fps}" -q:v 2 "${outputPattern}"`;
            await execAsync(command);

            const files = fs.readdirSync(tempDir)
                .filter(file => file.endsWith('.jpg'))
                .sort()
                .map(file => path.join(tempDir, file));

            return files;
        } catch (error) {
            console.error(`Failed to extract frames in range ${start}-${start+duration}:`, error);
            return [];
        }
    }

    /**
     * Refine segment start times using a second pass with higher resolution
     */
    public async refineTiming(
        videoPath: string,
        segments: TimingSegment[],
        videoDuration: number,
        apiKey: string,
        endpoint: string,
        deployment: string
    ): Promise<TimingSegment[]> {
        if (segments.length <= 1) return segments;

        console.log(`[Precision] Starting precision refinement for ${segments.length - 1} transition points... (Context: Video length ${videoDuration.toFixed(1)}s)`);
        
        // Final segments will have updated startTimes
        const firstSegment = segments[0] as TimingSegment;
        const finalized: TimingSegment[] = [firstSegment]; 

        for (let i = 1; i < segments.length; i++) {
            const current = segments[i] as TimingSegment;
            
            // Search window: 5s before and 5s after the coarse timestamp
            const searchStart = Math.min(videoDuration - 1, Math.max(0, current.startTime - 5));
            // Clamp duration so we don't exceed video length
            const searchDuration = Math.min(10, videoDuration - searchStart);
            
            if (searchDuration <= 0) {
                console.log(`[Precision] Skipping "${current.title}" - already at or past video end.`);
                finalized.push(current);
                continue;
            }

            console.log(`[Precision] Refining "${current.title}" near ${current.startTime}s (Window: ${searchStart.toFixed(1)}-${(searchStart + searchDuration).toFixed(1)}s)`);
            
            const frames = await this.extractFramesInRange(videoPath, searchStart, searchDuration, 1);
            if (frames.length === 0) {
                finalized.push(current);
                continue;
            }

            const userContent: any[] = [
                {
                    type: 'text',
                    text: `Attached are 10-11 frames from a video, captured every 1 second starting from ${searchStart} seconds. 
                    I'm looking for the EXACT second when the screen transitions to a new segment titled: "${current.title}".
                    
                    Please identify which image index (1-based, where 1 is ${searchStart}s) shows the FIRST frame of the new content.
                    Return JSON: {"exactSecondIndex": number, "confidence": number}`
                }
            ];

            for (const frame of frames) {
                const base64 = fs.readFileSync(frame).toString('base64');
                userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
            }

            const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
            
            try {
                const response = await axios.post(url, {
                    messages: [
                        { role: 'system', content: 'You are a video alignment expert. You help find the precise second of a transition.' },
                        { role: 'user', content: userContent }
                    ],
                    response_format: { type: "json_object" }
                }, {
                    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' }
                });

                const rawJson = response.data.choices[0].message.content;
                const result = JSON.parse(rawJson);
                // Index is 1-based
                let preciseTime = Math.min(videoDuration, searchStart + (result.exactSecondIndex - 1));
                
                // Ensure monotonicity: segment i cannot start before segment i-1
                const previousFinalized = finalized[i-1];
                if (previousFinalized && preciseTime < previousFinalized.startTime) {
                    console.log(`[Precision] Clamping "${current.title}" to ${previousFinalized.startTime}s (AI suggested ${preciseTime}s, but prev seg starts then)`);
                    preciseTime = previousFinalized.startTime;
                }

                console.log(`[Precision] Updated "${current.title}" start time: ${current.startTime}s -> ${preciseTime}s (Confidence: ${result.confidence})`);
                current.startTime = preciseTime;
            } catch (err) {
                console.warn(`[Precision] Failed to refine "${current.title}", keeping coarse time.`);
            }
            
            finalized.push(current);
        }

        return finalized;
    }

    /**
     * Analyze frame timings using AI
     * @param frames Array of image paths
     * @param script The original script content
     * @param videoDuration Total video duration in seconds
     * @param apiKey Azure OpenAI API Key
     * @param endpoint Azure OpenAI Endpoint
     * @param deployment GPT-5.2 deployment name
     * @returns JSON mapping of script segments to time offsets
     */
    public async analyzeTiming(
        frames: string[], 
        script: string, 
        videoDuration: number,
        apiKey: string, 
        endpoint: string,
        deployment: string,
        interval: number = 10
    ): Promise<any> {
        const userContent: any[] = [
            {
                type: 'text',
                text: `Video Total Duration: ${videoDuration.toFixed(1)} seconds. 
I have provided frames captured every ${interval} seconds (Frame 0=0s, Frame 1=${interval}s, Frame 2=${interval * 2}s, etc.).

Please analyze these frames and map the provided script segments to the correct Frame Indices.

IMPORTANT: Create catchy, click-worthy titles for each segment. Focus on the VALUE or ACTION shown. 
Instead of generic descriptions like "Introduction", use power words or "Hook" style titles (e.g., "3 Steps to Success" instead of "Demo Part 1").
Titles should be under 15 words or 15 Chinese characters.

Script:
${script}

Task:
1. Identify major transitions between apps/topics.
2. For each segment, provide the "startFrameIndex" (0, 1, 2...).
3. "startTime" should be (startFrameIndex * ${interval}).

Return a JSON object with a "segments" array. Each segment should have "startTime", "title", "content", and "startFrameIndex".`
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
                content: 'You are a video editor. Identify timestamps for script segments based on visual changes. Return ONLY JSON. Be concise.'
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
                max_completion_tokens: 8000
            }, {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });

            // The content might be a string that needs parsing if not using response_format correctly
            // or if the SDK returns it as a string. Azure OpenAI often returns a string.
            let content = response.data.choices[0].message.content;
            if (!content) {
                console.error('AI Response choice:', JSON.stringify(response.data.choices[0]));
            }
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
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('AI analysis failed:', message);
            throw error;
        }
    }

    /**
     * Second Pass: Refine specific transition point
     */
    public async refinePreciseTiming(
        frames: string[],
        segTitle: string,
        coarseTime: number,
        apiKey: string,
        endpoint: string,
        deployment: string
    ): Promise<number> {
        if (frames.length === 0) return coarseTime;

        const userContent: any[] = [
            {
                type: 'text',
                text: `These are 10 consecutive frames captured at 1-second intervals starting from ${Math.max(0, coarseTime - 5)}s.
We are looking for the EXACT second where the UI for "${segTitle}" first appears.
Look for visual cues like title change, new UI layout, or button clicks.
Respond with JSON only.`
            }
        ];

        frames.forEach((framePath) => {
            const base64Image = fs.readFileSync(framePath).toString('base64');
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Image}` }
            });
        });

        const messages = [
            { role: 'system', content: 'You are a video alignment specialist. Pinpoint the exact second [0-9] in the sequence where the transition happens.' },
            { role: 'user', content: userContent }
        ];

        try {
            const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
            const response = await axios.post(url, {
                messages,
                response_format: { type: "json_object" },
                max_completion_tokens: 500
            }, {
                headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const content = JSON.parse(response.data.choices[0].message.content);
            const relativeSecond = parseInt(content.transitionSecond || content.second || 0);
            const baseTime = Math.max(0, coarseTime - 5);
            return baseTime + relativeSecond;
        } catch (error) {
            return coarseTime; // Fallback
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

                        const rawContent = response.data.choices[0].message.content;
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
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error(`Refinement API error on attempt ${retry}:`, message);
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
