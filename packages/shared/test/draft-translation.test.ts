import { describe, expect, it } from 'vitest';
import { backtickSpans, replaceDraftSpans } from '../src/draft-translation.js';

describe('backtick translation spans', () => {
  it('keeps UTF-16 offsets and translates only marked spans, right to left', () => {
    const draft = '⚽ i want to play `bóng đá` with `bạn bè`!';
    const spans = backtickSpans(draft);
    expect(spans.map((span) => draft.slice(span.start, span.end))).toEqual([
      '`bóng đá`',
      '`bạn bè`',
    ]);
    expect(
      replaceDraftSpans(
        draft,
        spans.map((span, i) => ({ ...span, text: i ? 'friends' : 'football' })),
      ),
    ).toBe('⚽ i want to play football with friends!');
  });
  it('ignores incomplete, empty, escaped and Markdown code fence markers', () => {
    for (const draft of [
      'hello `bóng đá',
      'hello ``',
      'hello `  `',
      '\\`literal`',
      '```code```',
      '``code``',
    ]) {
      expect(backtickSpans(draft)).toEqual([]);
    }
  });
  it('recognizes a pasted draft containing repeated phrases', () => {
    expect(backtickSpans('`đi` then `đi`').map((span) => span.start)).toEqual([0, 10]);
    expect(backtickSpans('`` then `bóng đá`').map((span) => span.text)).toEqual(['bóng đá']);
  });
  it('ignores single backticks inside fenced code and escaped closing delimiters', () => {
    expect(backtickSpans('```\n`literal`\n``` and `bóng đá`').map((span) => span.text)).toEqual([
      'bóng đá',
    ]);
    expect(backtickSpans('hello `word\\`')).toEqual([]);
  });
});
