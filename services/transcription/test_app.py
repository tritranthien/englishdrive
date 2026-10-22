import os
import tempfile
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import app as api


class TranscriptApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.work = patch.object(api, 'WORK_DIR', self.temp.name)
        self.work.start()
        api.busy = False

    async def asyncTearDown(self):
        self.work.stop()
        self.temp.cleanup()

    def job(self, output):
        context = MagicMock()
        reader, writer = MagicMock(), MagicMock()
        reader.poll.return_value = True
        reader.recv.return_value = output
        context.Pipe.return_value = (reader, writer)
        process = context.Process.return_value
        process.pid = 12345
        process.is_alive.return_value = False
        return context, reader, writer, process

    async def test_validates_id_and_keeps_health_available(self):
        with TestClient(api.app) as client:
            self.assertEqual(client.get('/health').status_code, 200)
            self.assertEqual(client.post('/youtube/transcript', json={'videoId': 'https://example.com'}).status_code, 422)
            self.assertEqual(client.post('/youtube/transcript', json={'videoId': 'BaW_jenozKc', 'chunkSeconds': 901}).status_code, 422)
            self.assertEqual(client.post('/youtube/transcript', json={'videoId': 'BaW_jenozKc', 'startSeconds': -1}).status_code, 422)
            self.assertEqual(client.post('/video/transcript', json={'videoId': 'BaW_jenozKc', 'sourceUrl': 'https://example.com/v.mp4'}).status_code, 422)

    async def test_success_cleans_temporary_files_and_closes_process(self):
        expected = {'source': 'asr', 'segments': [{'id': 'a'}]}
        context, reader, writer, process = self.job({'result': expected})
        with patch.object(api.multiprocessing, 'get_context', return_value=context):
            output = await api.transcript(api.TranscriptRequest(videoId='BaW_jenozKc'), MagicMock())
        self.assertEqual(output, expected)
        self.assertFalse(api.busy)
        self.assertEqual(os.listdir(self.temp.name), [])
        reader.close.assert_called_once()
        process.close.assert_called_once()

    async def test_busy_worker_rejects_parallel_job(self):
        api.busy = True
        with self.assertRaises(HTTPException) as error:
            await api.transcript(api.TranscriptRequest(videoId='BaW_jenozKc'), MagicMock())
        self.assertEqual(error.exception.status_code, 429)

    async def test_worker_error_is_recoverable(self):
        context, _, _, _ = self.job({'error': 'Audio unavailable'})
        with patch.object(api.multiprocessing, 'get_context', return_value=context):
            with self.assertRaises(HTTPException) as error:
                await api.transcript(api.TranscriptRequest(videoId='BaW_jenozKc'), MagicMock())
        self.assertEqual(error.exception.status_code, 422)
        self.assertFalse(api.busy)
        self.assertEqual(os.listdir(self.temp.name), [])

    async def test_timeout_kills_job_and_cleans_directory(self):
        context, reader, _, process = self.job({})
        reader.poll.return_value = False
        process.is_alive.side_effect = [True, False]
        request = MagicMock()
        request.is_disconnected = AsyncMock(return_value=False)
        with patch.object(api.multiprocessing, 'get_context', return_value=context), \
                patch.dict(os.environ, {'TRANSCRIPTION_TIMEOUT_SECONDS': '1'}), \
                patch.object(api, 'time', MagicMock(monotonic=MagicMock(side_effect=[0, 2]))), \
                patch.object(api.os, 'killpg', create=True):
            with self.assertRaises(HTTPException) as error:
                await api.transcript(api.TranscriptRequest(videoId='BaW_jenozKc'), request)
        self.assertEqual(error.exception.status_code, 504)
        self.assertFalse(api.busy)
        self.assertEqual(os.listdir(self.temp.name), [])


if __name__ == '__main__':
    unittest.main()
