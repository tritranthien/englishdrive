import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
try {
  console.log(JSON.stringify({ allVideoStatuses: await db.videoLesson.groupBy({ by: ['status'], _count: { _all: true } }),
    transcriptionHealth: await fetch('http://transcription:8000/health').then(response => response.json()) }));
  const users = await db.user.findMany({ where: { email: { startsWith: 'deploy-smoke-', endsWith: '@example.invalid' } }, select: { id: true } });
  console.log(JSON.stringify({ temporarySmokeAccounts: users.length }));
  for (const user of users) {
    const threads = await db.chatThread.findMany({ where: { userId: user.id }, select: { id: true } });
    const jobs = await db.chatJob.findMany({ where: { threadId: { in: threads.map(thread => thread.id) } }, select: { kind: true, status: true, createdAt: true, updatedAt: true } });
    const videos = await db.videoLesson.findMany({ where: { userId: user.id }, select: { status: true, createdAt: true, updatedAt: true, errorMessage: true } });
    console.log(JSON.stringify({ jobs, videos }));
  }
} finally { await db.$disconnect(); }
