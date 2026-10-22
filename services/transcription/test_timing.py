import unittest
from timing import caption_words, sentence_segments


class TimingTests(unittest.TestCase):
    def test_preserves_valid_long_timestamps_and_silence(self):
        words = [{'startMs': time, 'endMs': time + 350, 'text': 'Hello.'}
                 for time in (100000, 120000, 425000)]
        cues = sentence_segments(words, 500000)
        self.assertEqual([cue['startMs'] for cue in cues], [100000, 120000, 425000])
        self.assertEqual(cues[0]['endMs'], 100350)

    def test_word_offsets_and_caption_overlap(self):
        events = [{'tStartMs': 1000, 'dDurationMs': 2000, 'segs': [
            {'utf8': 'Hello', 'tOffsetMs': 0}, {'utf8': 'world.', 'tOffsetMs': 500}]},
            {'tStartMs': 1600, 'dDurationMs': 1000, 'segs': [{'utf8': 'world.'}]}]
        words = caption_words(events)
        self.assertEqual([word['text'] for word in words], ['Hello', 'world.'])
        self.assertEqual(words[1]['startMs'], 1500)

    def test_does_not_invent_word_timings_for_manual_captions(self):
        words = caption_words([{'tStartMs': 120000, 'dDurationMs': 800, 'segs': [{'utf8': 'A short sentence.'}]}])
        cues = sentence_segments(words, 200000)
        self.assertEqual((cues[0]['startMs'], cues[0]['endMs']), (120000, 120800))

    def test_preserves_all_untimed_fragments_in_a_manual_caption(self):
        words = caption_words([{'tStartMs': 1000, 'dDurationMs': 1500,
                                'segs': [{'utf8': 'Hello '}, {'utf8': 'world.'}]}])
        self.assertEqual(words, [{'startMs': 1000, 'endMs': 2500, 'text': 'Hello world.'}])

    def test_breaks_on_pauses_and_six_second_boundary(self):
        words = [{'startMs': 0, 'endMs': 500, 'text': 'One'},
                 {'startMs': 1300, 'endMs': 1700, 'text': 'Two'},
                 {'startMs': 1800, 'endMs': 7500, 'text': 'Three'}]
        self.assertEqual(len(sentence_segments(words, 10000)), 3)

    def test_ignores_invalid_and_clips_to_media_end(self):
        words = [{'startMs': 100, 'endMs': 50, 'text': 'bad'},
                 {'startMs': 1000, 'endMs': 3000, 'text': 'Good.'}]
        self.assertEqual(sentence_segments(words, 2000)[0]['endMs'], 2000)


if __name__ == '__main__':
    unittest.main()
