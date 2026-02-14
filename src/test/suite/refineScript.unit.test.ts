import * as assert from 'assert';
import axios from 'axios';
import { VideoAnalyzer, TimingSegment } from '../../utils/videoAnalyzer';
import type { AxiosResponse } from 'axios';

suite('Refine Script Unit Test (No API)', () => {
    test('Should rewrite (not truncate) and never output ellipses', async () => {
        const analyzer = new VideoAnalyzer();

        const seg0: TimingSegment = {
            startTime: 0,
            title: 'App 列表（Daily App Lab）',
            content: '昨天晚上我睡觉的时候，我的开源项目在后台自动跑了一轮：它自己去网上追踪了时下的趋势和痛点，产出了几个 App 创意，甚至连原型代码都一起写好了。'
        };

        const seg1: TimingSegment = {
            startTime: 10,
            title: '结束',
            content: '结束与互动呼吁'
        };

        type AxiosPost = typeof axios.post;
        const originalPost: AxiosPost = axios.post;
        const mockedPost: AxiosPost = (async () => {
            const refinedText = '我睡着时，项目自动追趋势产出App创意并写好原型代码。';
            const response: Pick<AxiosResponse, 'data'> = {
                data: {
                    choices: [
                        {
                            message: {
                                content: JSON.stringify({
                                    refinedText,
                                    originalMeaningRetained: true,
                                    wordCount: analyzer.countWords(refinedText)
                                })
                            }
                        }
                    ]
                }
            };

            return response as AxiosResponse;
        }) as AxiosPost;

        (axios as unknown as { post: AxiosPost }).post = mockedPost;

        try {
            const refined = await analyzer.refineScript(
                [seg0, seg1],
                20,
                'fake-key',
                'https://fake-endpoint',
                'fake-deployment',
                2.5
            );

            const first = refined[0];
            assert.ok(first && first.adjustedContent, 'adjustedContent should exist');
            const adjusted = first.adjustedContent;
            assert.ok(!adjusted.includes('...'), 'Should not contain ASCII ellipses');
            assert.ok(!adjusted.includes('…'), 'Should not contain Unicode ellipsis');

            // Ensure it is not a simple prefix truncation of the original
            assert.notStrictEqual(adjusted, seg0.content.substring(0, adjusted.length), 'Should not be a pure prefix truncation');

            // Ensure it fits max words for 10 seconds at 2.5 WPS
            const maxWords = Math.floor(10 * 2.5);
            assert.ok(analyzer.countWords(adjusted) <= maxWords, 'Should fit within word limit');
        } finally {
            (axios as unknown as { post: AxiosPost }).post = originalPost;
        }
    });

    test('Should fallback without adding ellipses when AI returns empty', async () => {
        const analyzer = new VideoAnalyzer();

        const seg0: TimingSegment = {
            startTime: 0,
            title: 'App 列表（Daily App Lab）',
            content: '第一句完整句子。第二句也完整，但如果必须截断，希望能停在句号。第三句不重要。'
        };

        const seg1: TimingSegment = {
            startTime: 10,
            title: '结束',
            content: '结束'
        };

        type AxiosPost = typeof axios.post;
        const originalPost: AxiosPost = axios.post;
        const mockedPost: AxiosPost = (async () => {
            const response: Pick<AxiosResponse, 'data'> = {
                data: {
                    choices: [
                        {
                            message: {
                                content: ''
                            }
                        }
                    ]
                }
            };

            return response as AxiosResponse;
        }) as AxiosPost;

        (axios as unknown as { post: AxiosPost }).post = mockedPost;

        try {
            const refined = await analyzer.refineScript(
                [seg0, seg1],
                20,
                'fake-key',
                'https://fake-endpoint',
                'fake-deployment',
                1.0 // force smaller maxWords so fallback is likely
            );

            const first = refined[0];
            assert.ok(first && first.adjustedContent, 'Fallback adjustedContent should not be empty');
            const adjusted = first.adjustedContent;
            assert.ok(adjusted.length > 0, 'Fallback adjustedContent should not be empty');
            assert.ok(!adjusted.includes('...'), 'Fallback should not contain ASCII ellipses');
            assert.ok(!adjusted.includes('…'), 'Fallback should not contain Unicode ellipsis');

            const maxWords = Math.floor(10 * 1.0);
            assert.ok(analyzer.countWords(adjusted) <= maxWords, 'Fallback should fit within word limit');
        } finally {
            (axios as unknown as { post: AxiosPost }).post = originalPost;
        }
    });
});
