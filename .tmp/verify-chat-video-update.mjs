import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';

const prisma = new PrismaClient();
try {
  const health = await fetch('http://127.0.0.1:3000/health');
  assert.equal(health.status, 200);
  const audioUrl = process.env.TRANSCRIPTION_URL || 'http://transcription:8000';
  const audio = await fetch(`${audioUrl}/health`);
  assert.equal(audio.status, 200);
  const audioHealth = await audio.json();
  const invalidChunk = await fetch(`${audioUrl}/video/transcript`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: 'https://example.com/video.mp4', chunkSeconds: 901 }),
  });
  assert.equal(invalidChunk.status, 422);
  const migrations = await prisma.$queryRaw`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE migration_name IN ('20261022000000_chat_auto_correct', '20261022010000_video_chunks')
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  assert.equal(migrations.length, 2);
  const columns = await prisma.$queryRaw`
    SELECT table_name, column_name, column_default FROM information_schema.columns
    WHERE (table_name = 'ChatPreferences' AND column_name = 'autoCorrect')
       OR (table_name = 'VideoLesson' AND column_name = 'processedUntilMs')`;
  assert.equal(columns.length, 2);
  assert.equal(columns.find(column => column.column_name === 'autoCorrect').column_default, 'true');
  // Validate the generated client against both new fields without exposing account data.
  await prisma.chatPreferences.findFirst({ select: { autoCorrect: true } });
  await prisma.videoLesson.findFirst({ select: { processedUntilMs: true } });
  console.log(JSON.stringify({ api: 'healthy', audio: audioHealth.status, chunkLimit: 'verified', migrations: migrations.map(row => row.migration_name), defaultCorrections: true }));
} finally {
  await prisma.$disconnect();
}
