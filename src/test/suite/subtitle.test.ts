import * as assert from 'assert';
import { SubtitleUtils } from '../../utils/subtitle';
import { WordBoundary } from '../../types';

function extractSubtitleTexts(srt: string): string[] {
  return srt
    .trim()
    .split(/\n\n+/)
    .map(block => {
      const lines = block.split('\n');
      return lines.slice(2).join(' ').trim();
    })
    .filter(Boolean);
}

suite('SubtitleUtils', () => {
  test('should preserve English word spacing when generating subtitles', () => {
    const boundaries: WordBoundary[] = [
      { text: '这是', audioOffset: 0, duration: 400 },
      { text: 'Digital', audioOffset: 450, duration: 300 },
      { text: 'Toy,', audioOffset: 800, duration: 300 },
      { text: '案例', audioOffset: 1150, duration: 300 }
    ];

    const srt = SubtitleUtils.generateSRT(boundaries);
    const texts = extractSubtitleTexts(srt);

    assert.ok(texts.length > 0, 'SRT should contain subtitle text');
    assert.ok(texts[0]?.includes('Digital Toy'), 'English words should keep one space between words');
    assert.ok(!texts[0]?.includes('DigitalToy'), 'English words should not be concatenated');
  });

  test('should split subtitle on strong punctuation before stripping display punctuation', () => {
    const boundaries: WordBoundary[] = [
      { text: '第一句。', audioOffset: 0, duration: 300 },
      { text: '第二', audioOffset: 320, duration: 250 },
      { text: '句', audioOffset: 590, duration: 250 },
      { text: '继续', audioOffset: 860, duration: 250 }
    ];

    const srt = SubtitleUtils.generateSRT(boundaries);
    const texts = extractSubtitleTexts(srt);

    assert.strictEqual(texts.length, 2, 'Strong punctuation should cause an earlier subtitle break');
    assert.strictEqual(texts[0], '第一句', 'Display punctuation should be removed after splitting');
    assert.strictEqual(texts[1], '第二句继续');
  });

  test('should break subtitle when adjacent word gap is greater than max gap', () => {
    const boundaries: WordBoundary[] = [
      { text: 'Hello', audioOffset: 0, duration: 200 },
      { text: 'world', audioOffset: 260, duration: 200 },
      { text: 'again', audioOffset: 1800, duration: 220 }
    ];

    const srt = SubtitleUtils.generateSRT(boundaries);
    const texts = extractSubtitleTexts(srt);

    assert.strictEqual(texts.length, 2, 'Large time gaps should split subtitles');
    assert.strictEqual(texts[0], 'Hello world');
    assert.strictEqual(texts[1], 'again');
  });

  test('should split subtitle on comma when chunk is long enough', () => {
    const boundaries: WordBoundary[] = [
      { text: '做', audioOffset: 0, duration: 120 },
      { text: '视频', audioOffset: 140, duration: 180 },
      { text: '太', audioOffset: 340, duration: 120 },
      { text: '慢，', audioOffset: 480, duration: 180 },
      { text: '硬生生', audioOffset: 700, duration: 220 },
      { text: '磨出来', audioOffset: 940, duration: 220 }
    ];

    const srt = SubtitleUtils.generateSRT(boundaries);
    const texts = extractSubtitleTexts(srt);

    assert.strictEqual(texts.length, 2, 'Comma should trigger a split when subtitle chunk is long enough');
    assert.strictEqual(texts[0], '做视频太慢');
    assert.strictEqual(texts[1], '硬生生磨出来');
  });

  test('should insert a hard break between segments when previous segment has no ending punctuation', () => {
    const segmentGroups: WordBoundary[][] = [
      [
        { text: '复用', audioOffset: 0, duration: 180 },
        { text: '的', audioOffset: 180, duration: 80 },
        { text: '模板', audioOffset: 260, duration: 220 }
      ],
      [
        { text: '我', audioOffset: 1000, duration: 120 },
        { text: '先', audioOffset: 1120, duration: 120 },
        { text: '用', audioOffset: 1240, duration: 120 }
      ]
    ];

    const merged = SubtitleUtils.mergeSegmentBoundariesForSrt(segmentGroups);
    const srt = SubtitleUtils.generateSRT(merged);
    const texts = extractSubtitleTexts(srt);

    assert.strictEqual(texts.length, 2, 'Segment boundary should force subtitle split when punctuation is missing');
    assert.strictEqual(texts[0], '复用的模板');
    assert.strictEqual(texts[1], '我先用');
  });
});
