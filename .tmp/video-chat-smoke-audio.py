import json
import os
import resource
import time
import wave

from faster_whisper import WhisperModel
from timing import sentence_segments

with wave.open('/tmp/vps-transcription-smoke.wav', 'rb') as source:
    parameters = source.getparams()
    audio = source.readframes(source.getnframes())
    silence = b'\0' * source.getframerate() * source.getnchannels() * source.getsampwidth()
with wave.open('/tmp/vps-transcription-padded.wav', 'wb') as output:
    output.setparams(parameters)
    output.writeframes(silence + audio)
started = time.monotonic()
model = WhisperModel(os.getenv('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8',
                     cpu_threads=2, download_root='/models')
segments, language = model.transcribe('/tmp/vps-transcription-padded.wav', word_timestamps=True, vad_filter=True, beam_size=5)
words = [{'startMs': round(word.start * 1000), 'endMs': round(word.end * 1000), 'text': word.word}
         for segment in segments for word in (segment.words or [])]
duration_ms = round((parameters.nframes / parameters.framerate + 1) * 1000)
cues = sentence_segments(words, duration_ms)
assert cues and cues[0]['startMs'] >= 500, cues
assert 'football' in ' '.join(cue['text'] for cue in cues).lower(), cues
assert all(cue['endMs'] > cue['startMs'] for cue in cues), cues
print(json.dumps({'status': 'ok', 'model': 'small', 'device': 'cpu', 'language': language.language,
                  'secondsIncludingModelDownload': round(time.monotonic() - started, 1),
                  'peakRssMiB': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024), 'cues': cues}))
