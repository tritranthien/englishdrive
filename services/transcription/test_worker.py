import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from worker import transcribe_youtube


class TranscriptWorkerTests(unittest.TestCase):
    def test_direct_chunk_download_and_conversion_with_real_media_tools(self):
        import functools
        import http.server
        import shutil
        import subprocess
        import tempfile
        import threading
        from pathlib import Path
        import faster_whisper
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            self.skipTest('ffmpeg/ffprobe not installed')
        class QuietHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'sample.m4a'
            subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'aac', str(source)], check=True, timeout=15)
            server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            model = MagicMock()
            def recognize(wav, **_kwargs):
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', wav], check=True, capture_output=True)
                duration = float(json.loads(probe.stdout)['format']['duration'])
                self.assertGreater(duration, 1.5)
                self.assertLessEqual(duration, 2.1)
                return ([SimpleNamespace(words=[SimpleNamespace(start=0.1, end=0.3, word='Hello.')])], SimpleNamespace(language='en'))
            model.transcribe.side_effect = recognize
            try:
                url = f'http://127.0.0.1:{server.server_port}/sample.m4a'
                with patch('worker.validate_media_url', side_effect=lambda value: value), patch.object(faster_whisper, 'WhisperModel', return_value=model):
                    result = transcribe_youtube(None, 3, 2, url)
                self.assertEqual(result['segments'][0]['startMs'], 3100)
                self.assertEqual(result['endMs'], 5000)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)

    def test_decodes_real_pcm_audio_with_the_installed_av_version(self):
        import tempfile
        import wave
        from pathlib import Path
        from faster_whisper.audio import decode_audio
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'silence.wav'
            with wave.open(str(source), 'wb') as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(16000)
                output.writeframes(b'\0' * 32000)
            audio = decode_audio(str(source))
            self.assertEqual(len(audio), 16000)
            self.assertTrue((audio == 0).all())

    def test_prefers_manual_caption_and_never_loads_asr(self):
        import yt_dlp
        download = MagicMock()
        download.extract_info.return_value = {
            'duration': 180, 'title': 'Test',
            'subtitles': {'vi': [{'ext': 'json3', 'url': 'manual'}]},
            'automatic_captions': {'en': [{'ext': 'json3', 'url': 'automatic'}]},
        }
        download.urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({
            'events': [{'tStartMs': 120000, 'dDurationMs': 500, 'segs': [{'utf8': 'Hello.'}]}],
        }).encode()
        with patch.object(yt_dlp, 'YoutubeDL') as factory:
            factory.return_value.__enter__.return_value = download
            result = transcribe_youtube('BaW_jenozKc')
        self.assertEqual(result['source'], 'caption')
        self.assertEqual(result['languageCode'], 'vi')
        self.assertEqual(result['segments'][0]['startMs'], 120000)
        self.assertEqual(download.urlopen.call_args.args, ('manual',))

    def test_rejects_live_or_long_media_instead_of_silently_truncating(self):
        import yt_dlp
        for info in ({'duration': 100, 'is_live': True}, {'duration': 3601}, {'duration': None}):
            with patch.object(yt_dlp, 'YoutubeDL') as factory:
                factory.return_value.__enter__.return_value.extract_info.return_value = info
                with self.assertRaises(ValueError):
                    transcribe_youtube('BaW_jenozKc')

    def test_caption_chunks_keep_absolute_times_and_allow_silent_sections(self):
        import yt_dlp
        download = MagicMock()
        download.extract_info.return_value = {
            'duration': 3600, 'title': 'Long video',
            'subtitles': {'en': [{'ext': 'json3', 'url': 'manual'}]},
        }
        download.urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({'events': [
            {'tStartMs': 1000, 'dDurationMs': 500, 'segs': [{'utf8': 'First.'}]},
            {'tStartMs': 900000, 'dDurationMs': 500, 'segs': [{'utf8': 'Second.'}]},
            {'tStartMs': 1800000, 'dDurationMs': 500, 'segs': [{'utf8': 'Third.'}]},
        ]}).encode()
        with patch.object(yt_dlp, 'YoutubeDL') as factory:
            factory.return_value.__enter__.return_value = download
            second = transcribe_youtube('BaW_jenozKc', 900, 900)
            silent = transcribe_youtube('BaW_jenozKc', 2700, 900)
        self.assertEqual(second['durationMs'], 3600000)
        self.assertEqual(second['startMs'], 900000)
        self.assertEqual(second['endMs'], 1800000)
        self.assertEqual([s['startMs'] for s in second['segments']], [900000])
        self.assertEqual(silent['segments'], [])

    def test_asr_uses_original_word_times_and_cleans_download(self):
        import yt_dlp
        import faster_whisper
        from pathlib import Path
        download = MagicMock()
        info = {'duration': 180, 'title': 'Test'}
        source_path = None

        def factory(options):
            nonlocal source_path
            manager = MagicMock()
            manager.__enter__.return_value = download
            if not options['skip_download']:
                source_path = Path(options['outtmpl'].replace('%(ext)s', 'webm'))
                source_path.write_bytes(b'audio')
                download.prepare_filename.return_value = str(source_path)
            return manager

        download.extract_info.return_value = info
        words = [SimpleNamespace(start=100.0, end=100.35, word='Hello.')]
        model = MagicMock()
        model.transcribe.return_value = ([SimpleNamespace(words=words)], SimpleNamespace(language='en'))
        with patch.object(yt_dlp, 'YoutubeDL', side_effect=factory), \
                patch('worker.subprocess.run'), \
                patch.object(faster_whisper, 'WhisperModel', return_value=model), \
                patch.dict(os.environ, {'WHISPER_CACHE_DIR': 'unused-cache'}):
            result = transcribe_youtube('BaW_jenozKc')
        self.assertEqual(result['source'], 'asr')
        self.assertEqual(result['segments'][0]['startMs'], 100000)
        self.assertEqual(result['segments'][0]['endMs'], 100350)
        self.assertFalse(source_path.exists())
        self.assertTrue(model.transcribe.call_args.kwargs['word_timestamps'])

    def test_asr_chunk_offsets_word_times_and_downloads_only_the_requested_range(self):
        import yt_dlp
        import faster_whisper
        from pathlib import Path
        download = MagicMock()
        download.extract_info.return_value = {'duration': 3600, 'title': 'Long lesson'}
        captured = {}
        def factory(options):
            manager = MagicMock()
            manager.__enter__.return_value = download
            if not options['skip_download']:
                captured.update(options)
                source = Path(options['outtmpl'].replace('%(ext)s', 'webm'))
                source.write_bytes(b'audio')
                download.prepare_filename.return_value = str(source)
            return manager
        model = MagicMock()
        model.transcribe.return_value = ([SimpleNamespace(words=[SimpleNamespace(start=1.0, end=1.35, word='Hello.')])], SimpleNamespace(language='en'))
        with patch.object(yt_dlp, 'YoutubeDL', side_effect=factory), patch('worker.subprocess.run'), patch.object(faster_whisper, 'WhisperModel', return_value=model):
            result = transcribe_youtube('BaW_jenozKc', 900, 900)
        self.assertEqual(result['segments'][0]['startMs'], 901000)
        self.assertEqual(result['segments'][0]['endMs'], 901350)
        self.assertEqual(list(captured['download_ranges']({}, None)), [{'start_time': 900, 'end_time': 1800.0}])


if __name__ == '__main__':
    unittest.main()
