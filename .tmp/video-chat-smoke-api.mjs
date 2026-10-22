import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = `deploy-smoke-${randomUUID()}@example.invalid`;
const base = 'http://127.0.0.1:3000';
let token;
async function post(path, body, authenticated = true) {
  const response = await fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(110000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}, ${data.message ?? 'request failed'}`);
  return data;
}
try {
  const auth = await post('/auth/register', { email, password: randomUUID() + randomUUID(), name: 'Deployment smoke test' }, false);
  token = auth.accessToken;
  assert.equal(typeof token, 'string');
  const thread = await prisma.chatThread.create({ data: {
    userId: auth.user.id, kind: 'DIRECT', title: 'Deployment smoke test', archived: true,
    proactiveEnabled: false, nextProactiveAt: new Date('2099-01-01T00:00:00Z'),
  } });
  const path = `/chat/threads/${thread.id}/draft-translation`;
  const unauthorized = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: '`bóng đá`' }) });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await post(path, { draft: 'A normal draft.' }), { replacements: [] });
  const draft = '  I want to play `bóng đá` with `bạn bè`.  ';
  const translated = await post(path, { draft });
  assert.equal(translated.replacements.length, 2);
  let finalDraft = draft;
  for (const replacement of [...translated.replacements].sort((a, b) => b.start - a.start)) {
    assert.ok(draft.slice(replacement.start, replacement.end).startsWith('`'));
    assert.ok(draft.slice(replacement.start, replacement.end).endsWith('`'));
    finalDraft = finalDraft.slice(0, replacement.start) + replacement.text + finalDraft.slice(replacement.end);
  }
  assert.match(finalDraft.toLowerCase(), /football|soccer/);
  assert.match(finalDraft.toLowerCase(), /friends/);
  assert.ok(finalDraft.startsWith('  I want to play '));
  assert.ok(finalDraft.endsWith('.  '));
  assert.deepEqual(await post(path, { draft }), translated);
  const message = await prisma.chatMessage.create({ data: { threadId: thread.id, sequence: 1, role: 'CHARACTER', content: 'I play football on weekends.' } });
  const definition = await post(`/chat/threads/${thread.id}/vocabulary`, { messageId: message.id, start: 7, end: 15 });
  assert.equal(definition.term, 'football');
  assert.ok(definition.meaningVi.length > 0);
  const replyJobs = await prisma.chatJob.count({ where: { threadId: thread.id, kind: { in: ['REPLY', 'PROACTIVE'] } } });
  assert.equal(replyJobs, 0);
  const sourceResponse = await fetch('http://transcription:8000/youtube/transcript', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: 'jNQXAC9IVRw' }), signal: AbortSignal.timeout(60000),
  });
  assert.equal(sourceResponse.status, 200);
  const source = await sourceResponse.json();
  let video = await post('/videos', { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' });
  const deadline = Date.now() + 100000;
  while (video.status === 'PROCESSING' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const detail = await fetch(`${base}/videos/${video.id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    assert.equal(detail.status, 200);
    video = await detail.json();
  }
  assert.equal(video.status, 'READY', video.errorMessage ?? 'Video did not finish');
  assert.equal(video.subtitles.length, source.segments.length);
  assert.deepEqual(video.subtitles.map(cue => cue.startMs), source.segments.map(cue => cue.startMs));
  assert.ok(video.subtitles.every(cue => cue.textEn && cue.textVi && cue.endMs > cue.startMs));
  console.log(JSON.stringify({ status: 'ok', draft: finalDraft, term: definition.term, meaningVi: definition.meaningVi, cacheVerified: true, noReplyJobs: true,
    videoStatus: video.status, cueCount: video.subtitles.length, sourceTimestampsVerified: true }));
} finally {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  console.log('Temporary smoke-test account and conversation cleaned up.');
}
