const response = await fetch('http://transcription:8000/youtube/transcript', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ videoId: process.argv[2] ?? 'jNQXAC9IVRw' }), signal: AbortSignal.timeout(150000),
});
const result = await response.json();
if (!response.ok) {
  console.log(JSON.stringify({ status: response.status, detail: String(result.detail ?? 'Source unavailable').slice(0, 500) }));
  process.exitCode = 1;
} else {
  if (!result.segments?.length || !result.segments.every(segment => segment.startMs >= 0 && segment.endMs > segment.startMs && segment.endMs <= result.durationMs)) {
    throw new Error('Invalid source transcript timings');
  }
  console.log(JSON.stringify({ status: 'ok', source: result.source, language: result.languageCode, durationMs: result.durationMs, segmentCount: result.segments.length }));
}
