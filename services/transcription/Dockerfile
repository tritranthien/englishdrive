FROM denoland/deno:bin-2.5.6 AS deno
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deno /deno /usr/local/bin/deno
WORKDIR /app
COPY services/transcription/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY services/transcription/ .
RUN python -m unittest discover -s . -p 'test_*.py'
RUN useradd --create-home --uid 1000 worker && mkdir -p /models /tmp/englishdrive && chown -R worker:worker /models /tmp/englishdrive
USER worker
ENV WHISPER_CACHE_DIR=/models
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
