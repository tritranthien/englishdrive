"""Source timestamps stay in the original media timeline, including silence."""
import re


def caption_words(events):
    words = []
    for event in events:
        start = event.get('tStartMs')
        duration = event.get('dDurationMs')
        if not isinstance(start, (int, float)) or not isinstance(duration, (int, float)) or duration <= 0:
            continue
        # Styling can split a manual caption into several untimed fragments.
        # Combine fragments at the same offset before deriving end times.
        segments = []
        for fragment in event.get('segs') or []:
            offset = fragment.get('tOffsetMs', segments[-1]['tOffsetMs'] if segments else 0)
            if segments and offset == segments[-1]['tOffsetMs']:
                segments[-1]['utf8'] += fragment.get('utf8', '')
            else:
                segments.append({'tOffsetMs': offset, 'utf8': fragment.get('utf8', '')})
        for index, segment in enumerate(segments):
            text = re.sub(r'\s+', ' ', segment.get('utf8', '')).strip()
            if not text:
                continue
            word_start = start + segment.get('tOffsetMs', 0)
            next_offset = next((s['tOffsetMs'] for s in segments[index + 1:] if 'tOffsetMs' in s), duration)
            word_end = min(start + duration, start + next_offset)
            # Only timed fragments are split further; untimed manual captions
            # remain intact rather than inventing per-word speech timings.
            if word_end > word_start:
                words.append({'startMs': round(word_start), 'endMs': round(word_end), 'text': text})
    words.sort(key=lambda word: word['startMs'])
    unique = []
    for word in words:
        if unique and word['text'] == unique[-1]['text'] and word['startMs'] < unique[-1]['endMs']:
            unique[-1]['endMs'] = max(unique[-1]['endMs'], word['endMs'])
            continue
        # ASR caption windows can repeat the trailing words in the next window.
        if unique and word['startMs'] < unique[-1]['endMs']:
            old = unique[-1]
            old_parts, new_parts = old['text'].split(), word['text'].split()
            overlap = next((n for n in range(min(len(old_parts), len(new_parts)), 0, -1)
                            if old_parts[-n:] == new_parts[:n]), 0)
            if overlap:
                word = {**word, 'text': ' '.join(new_parts[overlap:])}
                if not word['text']:
                    continue
            old['endMs'] = min(old['endMs'], word['startMs'])
            if old['endMs'] <= old['startMs']:
                unique.pop()
        unique.append(word)
    return unique


def sentence_segments(words, duration_ms):
    result, pending = [], []

    def flush():
        if not pending:
            return
        start = max(0, round(pending[0]['startMs']))
        end = min(duration_ms, round(pending[-1]['endMs']))
        text = ' '.join(word['text'].strip() for word in pending).strip()
        text = re.sub(r'\s+([,.!?;:])', r'\1', text)
        if end > start and text:
            result.append({'id': f'segment-{len(result) + 1}', 'startMs': start, 'endMs': end, 'text': text})
        pending.clear()

    for word in words:
        if word['endMs'] <= word['startMs'] or not word['text'].strip():
            continue
        if pending and (word['startMs'] - pending[-1]['endMs'] >= 700 or
                        word['endMs'] - pending[0]['startMs'] > 6000 or
                        len(' '.join(item['text'] for item in pending)) + len(word['text']) > 500):
            flush()
        pending.append(word)
        if re.search(r'[.!?。！？]["\u201d\u2019]*$', word['text'].strip()):
            flush()
    flush()
    return result
