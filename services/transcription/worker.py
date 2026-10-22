import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
import ipaddress
import socket
from urllib.parse import urlparse

from timing import caption_words, sentence_segments


def validate_media_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Link video phải là HTTP/HTTPS công khai')
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80))
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Link video phải trỏ đến địa chỉ công khai')
    return url


def transcribe_youtube(video_id, start_seconds=0, chunk_seconds=None, source_url=None):
    import yt_dlp

    max_duration = int(os.getenv('TRANSCRIPTION_MAX_DURATION_SECONDS', '3600'))
    max_bytes = int(os.getenv('TRANSCRIPTION_MAX_AUDIO_BYTES', str(100 * 1024 * 1024)))
    url = validate_media_url(source_url) if source_url else f'https://www.youtube.com/watch?v={video_id}'
    options = {'quiet': True, 'no_warnings': True, 'noplaylist': True, 'skip_download': True,
               'socket_timeout': 20, 'retries': 2, 'js_runtimes': {'deno': {}}}
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=False)
        duration = info.get('duration') or 0
        if not duration and source_url:
            probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'json', url], check=True, timeout=30, capture_output=True)
            duration = float(json.loads(probe.stdout)['format']['duration'])
        if info.get('is_live') or not math.isfinite(duration) or duration <= 0 or duration > max_duration:
            raise ValueError(f'Chỉ hỗ trợ video có sẵn, dài tối đa {max_duration // 60} phút')
        duration_ms = round(duration * 1000)
        if start_seconds >= duration:
            raise ValueError('Đoạn xử lý nằm ngoài video')
        start_ms = round(start_seconds * 1000)
        end_ms = min(duration_ms, start_ms + round(chunk_seconds * 1000)) if chunk_seconds else duration_ms
        metadata = {'durationMs': duration_ms, 'title': info.get('title'), 'startMs': start_ms, 'endMs': end_ms}
        caption_result = None
        # Human captions first, English preferred within each class.
        for tracks in (info.get('subtitles') or {}, info.get('automatic_captions') or {}):
            languages = sorted(tracks, key=lambda lang: (not lang.startswith('en'), lang))
            for language in languages:
                if language == 'live_chat' or '-orig' in language:
                    continue
                track = next((item for item in tracks[language] if item.get('ext') == 'json3'), None)
                if not track:
                    continue
                try:
                    with downloader.urlopen(track['url']) as response:
                        data = response.read(8 * 1024 * 1024 + 1)
                    if len(data) > 8 * 1024 * 1024:
                        continue
                    segments = sentence_segments(caption_words(json.loads(data).get('events', [])), duration_ms)
                    if segments:
                        caption_result = {'source': 'caption', 'languageCode': language, 'segments': segments}
                        break
                except Exception:
                    continue
            if caption_result:
                break
        if caption_result:
            # Each cue belongs to exactly one half-open chunk; preserve absolute source times.
            caption_result['segments'] = [
                {**segment, 'endMs': min(segment['endMs'], end_ms)}
                for segment in caption_result['segments'] if start_ms <= segment['startMs'] < end_ms
            ]
            return {**caption_result, **metadata}

    def check_size(progress):
        if max(progress.get('downloaded_bytes') or 0, progress.get('total_bytes') or 0) > max_bytes:
            raise ValueError('Audio vượt quá giới hạn tải về')

    with tempfile.TemporaryDirectory(prefix='englishdrive-audio-') as temp:
        range_options = {}
        if chunk_seconds:
            from yt_dlp.utils import download_range_func
            range_options = {'download_ranges': download_range_func(None, [(start_seconds, end_ms / 1000)])}
        with yt_dlp.YoutubeDL({**options, 'skip_download': False, 'format': 'bestaudio/best',
                               'outtmpl': str(Path(temp) / 'source.%(ext)s'),
                               'max_filesize': max_bytes, 'progress_hooks': [check_size], **range_options}) as downloader:
            downloaded = downloader.extract_info(url, download=True)
            source = Path(downloader.prepare_filename(downloaded))
        if not source.is_file() or source.stat().st_size > max_bytes:
            raise ValueError('Không tải được audio trong giới hạn cho phép')
        wav = Path(temp) / 'audio.wav'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(source), '-t', str((end_ms - start_ms) / 1000), '-vn', '-ac', '1', '-ar', '16000', str(wav)],
                       check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        from faster_whisper import WhisperModel
        model = WhisperModel(os.getenv('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8',
                             cpu_threads=int(os.getenv('WHISPER_CPU_THREADS', '2')),
                             download_root=os.getenv('WHISPER_CACHE_DIR', '/models'))
        segments, language = model.transcribe(str(wav), word_timestamps=True, vad_filter=True, beam_size=5)
        words = [{'startMs': start_ms + round(word.start * 1000), 'endMs': min(end_ms, start_ms + round(word.end * 1000)), 'text': word.word}
                 for segment in segments for word in (segment.words or []) if start_ms + round(word.start * 1000) < end_ms]
        result = sentence_segments(words, end_ms)
        if not result and not chunk_seconds:
            raise ValueError('Không tìm thấy lời nói trong video')
        return {'source': 'asr', 'languageCode': language.language, **metadata, 'segments': result}


def run_job(video_id, connection, temp_dir, start_seconds=0, chunk_seconds=None, source_url=None):
    # Keep ffmpeg in the same process group for deadline cancellation.
    if os.name == 'posix':
        os.setsid()
    tempfile.tempdir = temp_dir
    try:
        connection.send({'result': transcribe_youtube(video_id, start_seconds, chunk_seconds, source_url)})
    except Exception as error:
        connection.send({'error': str(error)[:500]})
    finally:
        connection.close()
