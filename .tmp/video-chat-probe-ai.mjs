import { PrismaClient } from '@prisma/client';
import { ApiKeysService } from './dist/admin/api-keys.service.js';
import { VideosAiService } from './dist/videos/videos-ai.service.js';
const db = new PrismaClient();
await new ApiKeysService(db).load();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).includes(':generateContent')) return originalFetch(url, options);
  const model = String(url).split('/models/')[1].split(':')[0];
  const started = Date.now();
  console.log(JSON.stringify({ stage: 'request', model }));
  try {
    const response = await originalFetch(url, { ...options, signal: AbortSignal.timeout(30000) });
    const body = await response.clone().json();
    const raw = body.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('');
    let shape;
    try { const data = JSON.parse(raw); shape = { keys: Object.keys(data), cueCount: data.cues?.length, ids: data.cues?.map(cue => cue.id) }; } catch { shape = { parseable: false, textLength: raw?.length ?? 0 }; }
    console.log(JSON.stringify({ stage: 'response', model, status: response.status, milliseconds: Date.now() - started,
      finishReason: body.candidates?.[0]?.finishReason, errorCode: body.error?.status, shape }));
    return response;
  } catch (error) { console.log(JSON.stringify({ stage: 'failure', model, milliseconds: Date.now() - started, error: error.name })); throw error; }
};
try {
  const result = await new VideosAiService().generateSubtitles({ sourceType: 'YOUTUBE', externalId: 'jNQXAC9IVRw', normalizedUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', defaultTitle: 'Public video smoke test', thumbnailUrl: null });
  console.log(JSON.stringify({ status: 'ok', cueCount: result.cues.length, timestamps: result.cues.map(cue => [cue.startMs, cue.endMs]) }));
} finally { await db.$disconnect(); }
