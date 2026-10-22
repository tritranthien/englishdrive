import asyncio
from contextlib import asynccontextmanager
import multiprocessing
import os
from pathlib import Path
import shutil
import signal
import tempfile
import time

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from worker import run_job

busy = False
WORK_DIR = os.getenv('TRANSCRIPTION_WORK_DIR', '/tmp/englishdrive')


def remove_job(directory):
    path = Path(directory)
    if path.name.startswith('job-') and not path.is_symlink() and path.resolve().parent == Path(WORK_DIR).resolve():
        shutil.rmtree(path, ignore_errors=True)


@asynccontextmanager
async def lifespan(_app):
    # Dedicated mount: interrupted jobs are cleaned after container restart.
    os.makedirs(WORK_DIR, exist_ok=True)
    for name in os.listdir(WORK_DIR):
        remove_job(os.path.join(WORK_DIR, name))
    yield


app = FastAPI(lifespan=lifespan)


class TranscriptRequest(BaseModel):
    videoId: str | None = Field(default=None, pattern=r'^[A-Za-z0-9_-]{11}$')
    sourceUrl: str | None = Field(default=None, max_length=4000)
    startSeconds: int = Field(default=0, ge=0, le=86400)
    chunkSeconds: int | None = Field(default=None, ge=1, le=900)

    @model_validator(mode='after')
    def one_source(self):
        if bool(self.videoId) == bool(self.sourceUrl):
            raise ValueError('Cần chọn một nguồn video')
        return self


@app.get('/health')
async def health():
    return {'status': 'ok', 'busy': busy}


@app.post('/youtube/transcript')
@app.post('/video/transcript')
async def transcript(body: TranscriptRequest, request: Request):
    global busy
    if busy:
        raise HTTPException(429, 'Đang xử lý video khác, hãy thử lại sau')
    busy = True
    process = reader = writer = temp = None
    try:
        context = multiprocessing.get_context('spawn')
        reader, writer = context.Pipe(duplex=False)
        temp = tempfile.mkdtemp(prefix='job-', dir=WORK_DIR)
        process = context.Process(target=run_job, args=(body.videoId, writer, temp, body.startSeconds, body.chunkSeconds, body.sourceUrl))
        process.start()
        writer.close()
        deadline = time.monotonic() + int(os.getenv('TRANSCRIPTION_TIMEOUT_SECONDS', '1800'))
        while not reader.poll():
            if await request.is_disconnected():
                raise HTTPException(499, 'Đã hủy xử lý')
            if time.monotonic() >= deadline:
                raise HTTPException(504, 'Xử lý audio quá thời gian cho phép')
            if not process.is_alive():
                raise HTTPException(503, 'Dịch vụ audio bị gián đoạn')
            await asyncio.sleep(0.2)
        try:
            output = reader.recv()
        except EOFError:
            raise HTTPException(503, 'Dịch vụ audio bị gián đoạn')
        if 'error' in output:
            raise HTTPException(422, output['error'])
        return output['result']
    finally:
        if process and process.pid and process.is_alive():
            try:
                if os.name == 'posix':
                    os.killpg(process.pid, signal.SIGTERM)
                else:
                    process.terminate()
            except ProcessLookupError:
                process.terminate()
            await asyncio.to_thread(process.join, 5)
            if process.is_alive():
                process.kill()
                await asyncio.to_thread(process.join, 2)
        if process and process.pid:
            process.join(timeout=0)
            process.close()
        if reader:
            reader.close()
        if writer:
            writer.close()
        if temp:
            remove_job(temp)
        busy = False
