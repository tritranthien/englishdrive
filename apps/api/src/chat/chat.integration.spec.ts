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
      generate: vi.fn(
        async (): Promise<Record<string, string>> => ({
          memory: 'Only this conversation memory.',
        }),
      ),
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
    it('defaults corrections on and preserves the off setting for older clients', async () => {
      const defaults = await chat.preferences(userId);
      await chat.savePreferences(userId, { ...defaults, autoCorrect: false });
      const { autoCorrect, ...legacy } = defaults;
      expect(autoCorrect).toBe(true);
      await chat.savePreferences(userId, legacy);
      expect((await chat.preferences(userId)).autoCorrect).toBe(false);
    });

    it.each([true, false])(
      'passes autoCorrect=%s to the reply worker',
      async (autoCorrect) => {
        const prefs = await chat.preferences(userId);
        await chat.savePreferences(userId, { ...prefs, autoCorrect });
        const thread = await direct();
        await chat.send(
          userId,
          thread.id,
          randomUUID(),
          'Yesterday I go to school.',
        );
        await due();
        await worker().tick();
        expect(ai.reply).toHaveBeenCalledWith(
          expect.objectContaining({ autoCorrect }),
        );
      },
    );

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
    it('looks up only the selected phrase in an owned message and caches the definition', async () => {
      const thread = await direct();
      const message = await chat.send(
        userId,
        thread.id,
        randomUUID(),
        'I get off work at six.',
      );
      const definition = {
        meaningVi: 'tan làm',
        pronunciation: '/ɡet ɒf wɜːk/',
        partOfSpeech: 'cụm động từ',
        explanation: 'Kết thúc giờ làm việc.',
        example: 'I get off work at five.',
      };
      ai.generate.mockResolvedValueOnce(definition);
      const result = await chat.lookupVocabulary(
        userId,
        thread.id,
        message.id,
        2,
        14,
      );
      expect(result).toEqual({ ...definition, term: 'get off work' });
      expect(ai.generate.mock.calls[0]).toBeDefined();
      expect((ai.generate.mock.calls[0] as unknown[])[1]).toEqual({
        term: 'get off work',
        message: message.content,
      });
      expect(
        await chat.lookupVocabulary(userId, thread.id, message.id, 2, 14),
      ).toEqual(result);
      expect(ai.generate).toHaveBeenCalledTimes(1);
      await expect(
        chat.lookupVocabulary(randomUUID(), thread.id, message.id, 2, 14),
      ).rejects.toThrow('Không tìm thấy');
      await expect(
        chat.lookupVocabulary(userId, thread.id, randomUUID(), 2, 14),
      ).rejects.toThrow('Không tìm thấy');
      for (const [start, end] of [
        [-1, 3],
        [3, 2],
        [0, 999],
        [1, 2],
      ]) {
        await expect(
          chat.lookupVocabulary(userId, thread.id, message.id, start, end),
        ).rejects.toThrow('Hãy chọn');
      }
      expect(ai.generate).toHaveBeenCalledTimes(1);
    });
    it('does not use a message from another thread as lookup context', async () => {
      const thread = await direct();
      const person = await chat.addCharacter(userId, { templateId: 'alex' });
      const other = await chat.createThread(userId, {
        kind: 'DIRECT',
        title: person.name,
        characterIds: [person.id],
      });
      const secret = await chat.send(
        userId,
        other.id,
        randomUUID(),
        'private-secret-marker',
      );
      await expect(
        chat.lookupVocabulary(userId, thread.id, secret.id, 0, 7),
      ).rejects.toThrow('Không tìm thấy');
      expect(ai.generate).not.toHaveBeenCalled();
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
    it('waits three seconds after the latest send and coalesces a burst into one reply', async () => {
      const thread = await direct();
      const before = Date.now();
      await chat.send(userId, thread.id, randomUUID(), 'Hello');
      await chat.send(userId, thread.id, randomUUID(), 'One more thing');
      const jobs = await prisma.chatJob.findMany({
        where: { threadId: thread.id },
      });
      const pending = jobs.filter((job) => job.status === 'PENDING');
      expect(pending).toHaveLength(1);
      expect(pending[0].dueAt.getTime()).toBeGreaterThanOrEqual(before + 3000);
      await worker().tick();
      expect(ai.reply).not.toHaveBeenCalled();
      await due();
      await worker().tick();
      expect(ai.reply).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(ai.reply.mock.calls[0][0])).toContain(
        'One more thing',
      );
    });
    it('holds replies while a draft is active, enforces ownership and expires abandoned presence', async () => {
      const thread = await direct();
      await chat.send(userId, thread.id, randomUUID(), 'First message');
      await chat.typing(userId, thread.id, true);
      await due();
      await worker().tick();
      expect(ai.reply).not.toHaveBeenCalled();
      await expect(chat.typing(randomUUID(), thread.id, false)).rejects.toThrow(
        'Không tìm thấy',
      );
      await chat.typing(userId, thread.id, false);
      const pending = await prisma.chatJob.findFirstOrThrow({
        where: { threadId: thread.id, status: 'PENDING' },
      });
      expect(pending.dueAt.getTime()).toBeGreaterThan(Date.now() + 2500);
      await chat.typing(userId, thread.id, true);
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { typingUntil: new Date(0) },
      });
      await due();
      await worker().tick();
      expect(ai.reply).toHaveBeenCalledTimes(1);
    });
    it.each(['typing', 'send'] as const)(
      'discards in-flight output when the user resumes %s',
      async (action) => {
        const thread = await direct();
        await chat.send(userId, thread.id, randomUUID(), 'Initial message');
        await due();
        let release!: () => void;
        let started!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const generating = new Promise<void>((resolve) => {
          started = resolve;
        });
        ai.reply.mockImplementationOnce(async (context) => {
          started();
          await gate;
          return {
            messages: [
              { characterId: context.members[0].id, content: 'Stale reply' },
            ],
          };
        });
        const running = worker().tick();
        await generating;
        if (action === 'typing') await chat.typing(userId, thread.id, true);
        else await chat.send(userId, thread.id, randomUUID(), 'New message');
        release();
        await running;
        expect(
          await prisma.chatMessage.count({
            where: { threadId: thread.id, role: 'CHARACTER' },
          }),
        ).toBe(0);
        if (action === 'typing') {
          await chat.send(userId, thread.id, randomUUID(), 'New message');
          await chat.typing(userId, thread.id, false);
        }
        await due();
        await worker().tick();
        expect(
          await prisma.chatMessage.count({
            where: { threadId: thread.id, role: 'CHARACTER' },
          }),
        ).toBe(1);
        expect(JSON.stringify(ai.reply.mock.calls.at(-1)?.[0])).toContain(
          'New message',
        );
      },
    );
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
