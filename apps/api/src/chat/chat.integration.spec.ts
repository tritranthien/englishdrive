import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ChatService } from './chat.service.js';
import { ChatWorkerService } from './chat-worker.service.js';
import type { ChatAiService } from './chat-ai.service.js';
import type { ChatPushService } from './chat-push.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

// Always use a separate, explicitly supplied test database. Never use the application's .env database.
describe.skipIf(!process.env.CHAT_TEST_DATABASE_URL)(
  'chat PostgreSQL integration',
  () => {
    const prisma = new PrismaClient({
      datasourceUrl: process.env.CHAT_TEST_DATABASE_URL,
    });
    let userId: string;
    const ai = {
      reply: vi.fn(
        async (context: { kind: string; members: Array<{ id: string }> }) => ({
          messages: (context.kind === 'GROUP'
            ? context.members.slice(0, 2)
            : context.members.slice(0, 1)
          ).map((c, index) => ({
            characterId: c.id,
            content: `Hello, friend ${index}!`,
          })),
        }),
      ),
      generate: vi.fn(async () => ({
        memory: 'Only this conversation memory.',
      })),
    };
    const push = { send: vi.fn(async () => {}) };
    const chat = new ChatService(
      prisma as PrismaService,
      ai as unknown as ChatAiService,
    );
    const worker = () =>
      new ChatWorkerService(
        prisma as PrismaService,
        ai as unknown as ChatAiService,
        push as unknown as ChatPushService,
        chat,
      );
    beforeAll(async () => {
      await prisma.$connect();
      vi.stubEnv('CHAT_PROACTIVE_ENABLED', 'true');
    });
    afterAll(async () => {
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      vi.clearAllMocks();
      userId = randomUUID();
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@chat.test`,
          name: 'Test learner',
          passwordHash: 'test-only-not-a-login',
        },
      });
      await chat.savePreferences(userId, {
        enabled: true,
        minMinutes: 5,
        maxMinutes: 5,
        dailyLimit: 2,
        quietStart: 0,
        quietEnd: 0,
        timezone: 'UTC',
      });
    });
    afterEach(async () => {
      await prisma.user.delete({ where: { id: userId } });
    });
    async function direct() {
      const person = await chat.addCharacter(userId, { templateId: 'mai' });
      return chat.createThread(userId, {
        kind: 'DIRECT',
        title: person.name,
        characterIds: [person.id],
      });
    }
    async function due() {
      await prisma.chatJob.updateMany({
        where: { thread: { userId }, status: 'PENDING' },
        data: { dueAt: new Date(0) },
      });
    }

    it('deduplicates concurrent mobile retries and creates just one reply job', async () => {
      const thread = await direct(),
        id = randomUUID();
      const sent = await Promise.all(
        Array.from({ length: 8 }, () =>
          chat.send(userId, thread.id, id, 'Hello!'),
        ),
      );
      expect(new Set(sent.map((m) => m.id)).size).toBe(1);
      expect(
        await prisma.chatJob.count({
          where: { threadId: thread.id, kind: 'REPLY' },
        }),
      ).toBe(1);
      await due();
      await Promise.all([worker().tick(), worker().tick()]);
      expect(ai.reply).toHaveBeenCalledTimes(1);
      const messages = await prisma.chatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { sequence: 'asc' },
      });
      expect(messages.map((m) => m.sequence)).toEqual([1, 2]);
      expect(
        await prisma.chatJob.count({
          where: { threadId: thread.id, kind: 'PUSH' },
        }),
      ).toBe(1);
    });
    it('enforces account ownership and validates group membership and romance', async () => {
      const thread = await direct();
      await expect(chat.thread(randomUUID(), thread.id)).rejects.toThrow(
        'Không tìm thấy',
      );
      const second = await chat.addCharacter(userId, { templateId: 'alex' });
      const group = await chat.createThread(userId, {
        kind: 'GROUP',
        title: 'Study group',
        characterIds: [thread.members[0].characterId, second.id],
      });
      await expect(
        chat.updateThread(userId, group.id, { romance: true }),
      ).rejects.toThrow('chat riêng');
      await expect(
        chat.createThread(randomUUID(), {
          kind: 'DIRECT',
          title: 'Invalid',
          characterIds: [second.id],
        }),
      ).rejects.toThrow('của bạn');
      await chat.send(userId, group.id, randomUUID(), 'How was your weekend?');
      await due();
      await worker().tick();
      const replies = await prisma.chatMessage.findMany({
        where: { threadId: group.id, role: 'CHARACTER' },
      });
      expect(replies).toHaveLength(2);
      expect(new Set(replies.map((m) => m.characterId)).size).toBe(2);
      const context = ai.reply.mock.calls[0][0] as { [key: string]: unknown };
      expect(JSON.stringify(context)).not.toContain('private-secret-marker');
    });
    it('reserves a shared daily limit across concurrent schedulers and does not catch up', async () => {
      const first = await direct();
      for (const templateId of ['alex', 'emma', 'leo']) {
        const c = await chat.addCharacter(userId, { templateId });
        await chat.createThread(userId, {
          kind: 'DIRECT',
          title: c.name,
          characterIds: [c.id],
        });
      }
      await prisma.chatThread.updateMany({
        where: { userId },
        data: { nextProactiveAt: new Date(0) },
      });
      await Promise.all([worker().schedule(), worker().schedule()]);
      expect(
        await prisma.chatJob.count({
          where: { thread: { userId }, kind: 'PROACTIVE' },
        }),
      ).toBe(2);
      expect(
        await prisma.chatThread.count({
          where: { userId, nextProactiveAt: { gt: new Date() } },
        }),
      ).toBe(4);
      await worker().tick();
      await prisma.chatThread.update({
        where: { id: first.id },
        data: { unattendedRounds: 2, nextProactiveAt: new Date(0) },
      });
      await worker().schedule();
      expect(
        await prisma.chatJob.count({
          where: { thread: { userId }, kind: 'PROACTIVE' },
        }),
      ).toBe(2);
    });
    it('blocks proactive rounds during quiet hours while allowing user replies', async () => {
      const thread = await direct();
      const hour = new Date().getUTCHours();
      await chat.savePreferences(userId, {
        enabled: true,
        minMinutes: 5,
        maxMinutes: 5,
        dailyLimit: 6,
        quietStart: hour,
        quietEnd: (hour + 1) % 24,
        timezone: 'UTC',
      });
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { nextProactiveAt: new Date(0) },
      });
      await worker().schedule();
      expect(
        await prisma.chatJob.count({ where: { threadId: thread.id } }),
      ).toBe(0);
      await chat.send(userId, thread.id, randomUUID(), 'Are you there?');
      await due();
      await worker().tick();
      expect(
        await prisma.chatMessage.count({
          where: { threadId: thread.id, role: 'CHARACTER' },
        }),
      ).toBe(1);
    });
    it('recovers expired leases and prevents replaying a completed reply', async () => {
      const thread = await direct();
      await chat.send(userId, thread.id, randomUUID(), 'Hello again');
      await prisma.chatJob.updateMany({
        where: { threadId: thread.id, kind: 'REPLY' },
        data: {
          status: 'RUNNING',
          leaseToken: 'old-worker',
          leaseUntil: new Date(0),
          attempts: 1,
        },
      });
      await worker().tick();
      await worker().tick();
      expect(ai.reply).toHaveBeenCalledTimes(1);
      expect(
        await prisma.chatMessage.count({
          where: { threadId: thread.id, role: 'CHARACTER' },
        }),
      ).toBe(1);
      await chat.read(userId, thread.id, 999);
      expect((await chat.thread(userId, thread.id)).lastReadSequence).toBe(2);
    });
    it('keeps private conversation history out of group generation', async () => {
      const privateChat = await direct();
      await chat.send(
        userId,
        privateChat.id,
        randomUUID(),
        'private-secret-marker',
      );
      const person = await chat.addCharacter(userId, { templateId: 'alex' });
      const group = await chat.createThread(userId, {
        kind: 'GROUP',
        title: 'Friends',
        characterIds: [person.id, privateChat.members[0].characterId],
      });
      await chat.send(userId, group.id, randomUUID(), 'Hello group');
      await prisma.chatJob.updateMany({
        where: { threadId: group.id },
        data: { dueAt: new Date(0) },
      });
      await worker().tick();
      const groupContext = ai.reply.mock.calls.find(
        ([context]) => context.kind === 'GROUP',
      );
      expect(groupContext).toBeDefined();
      expect(JSON.stringify(groupContext)).not.toContain(
        'private-secret-marker',
      );
    });
  },
);
