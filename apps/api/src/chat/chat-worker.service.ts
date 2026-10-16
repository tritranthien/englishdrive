import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatAiService } from './chat-ai.service.js';
import { ChatPushService } from './chat-push.service.js';
import { ChatService, threadInclude } from './chat.service.js';
import { localClock, nextContact, quietHour } from './chat.schemas.js';

@Injectable()
export class ChatWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatWorkerService.name);
  private worker?: ReturnType<typeof setInterval>;
  private scheduler?: ReturnType<typeof setInterval>;
  private working = false;
  private scheduling = false;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: ChatAiService,
    private readonly push: ChatPushService,
    private readonly chat: ChatService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.worker = setInterval(() => {
      void this.tick().catch((error) => this.logger.error(error));
    }, 2000);
    this.scheduler = setInterval(() => {
      void this.schedule().catch((error) => this.logger.error(error));
    }, 30000);
    this.worker.unref();
    this.scheduler.unref();
    void this.schedule().catch((error) => this.logger.error(error));
  }
  onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.worker);
    clearInterval(this.scheduler);
  }

  async schedule(now = new Date()) {
    if (this.scheduling || process.env.CHAT_PROACTIVE_ENABLED !== 'true')
      return;
    this.scheduling = true;
    try {
      const candidates = await this.prisma.chatThread.findMany({
        where: {
          archived: false,
          proactiveEnabled: true,
          unattendedRounds: { lt: 2 },
          nextProactiveAt: { lte: now },
        },
        orderBy: { nextProactiveAt: 'asc' },
        take: 100,
      });
      for (const candidate of candidates)
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${candidate.userId} FOR UPDATE`;
          await this.chat.lock(tx, candidate.userId, candidate.id);
          const thread = await tx.chatThread.findUniqueOrThrow({
            where: { id: candidate.id },
          });
          if (
            thread.archived ||
            !thread.proactiveEnabled ||
            thread.unattendedRounds >= 2 ||
            thread.nextProactiveAt > now
          )
            return;
          const prefs = await tx.chatPreferences.upsert({
            where: { userId: thread.userId },
            create: { userId: thread.userId },
            update: {},
          });
          const local = localClock(now, prefs.timezone);
          const jobs = await tx.chatJob.findMany({
            where: {
              kind: 'PROACTIVE',
              status: { not: 'CANCELLED' },
              thread: { userId: thread.userId },
              createdAt: { gte: new Date(now.getTime() - 48 * 3600000) },
            },
            select: { createdAt: true },
          });
          const daily = jobs.filter(
            (job) =>
              localClock(job.createdAt, prefs.timezone).day === local.day,
          ).length;
          const busy = await tx.chatJob.count({
            where: {
              threadId: thread.id,
              kind: { in: ['PROACTIVE', 'REPLY'] },
              status: { in: ['PENDING', 'RUNNING'] },
            },
          });
          await tx.chatThread.update({
            where: { id: thread.id },
            data: {
              nextProactiveAt: nextContact(
                thread.minMinutes ?? prefs.minMinutes,
                thread.maxMinutes ?? prefs.maxMinutes,
                now,
              ),
            },
          });
          if (
            !prefs.enabled ||
            quietHour(local.hour, prefs.quietStart, prefs.quietEnd) ||
            daily >= prefs.dailyLimit ||
            busy
          )
            return;
          await tx.chatJob.create({
            data: {
              threadId: thread.id,
              key: `proactive:${thread.id}:${thread.nextProactiveAt.toISOString()}`,
              kind: 'PROACTIVE',
              triggerSequence: thread.lastSequence,
              dueAt: now,
            },
          });
        });
    } finally {
      this.scheduling = false;
    }
  }
  async tick() {
    if (this.working || this.stopped) return;
    this.working = true;
    try {
      await Promise.all([this.claimAndRun(), this.claimAndRun()]);
    } finally {
      this.working = false;
    }
  }
  private async claimAndRun() {
    const leaseToken = randomUUID();
    const rows = await this.prisma.$transaction(async (tx) => {
      // Serialize the short claim transaction across API instances. Generation runs outside it.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(483719265)::text`;
      await tx.chatJob.updateMany({
        where: {
          status: 'RUNNING',
          attempts: { gte: 3 },
          leaseUntil: { lt: new Date() },
        },
        data: { status: 'FAILED', leaseUntil: null },
      });
      return tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "ChatJob" SET status='RUNNING', "leaseToken"=${leaseToken}, "leaseUntil"=NOW()+INTERVAL '120 seconds', attempts=attempts+1, "updatedAt"=NOW()
      WHERE id IN (
        SELECT j.id FROM "ChatJob" j WHERE j.kind IN ('REPLY','PROACTIVE','PUSH') AND j.attempts < 3
        AND ((j.status='PENDING' AND j."dueAt"<=NOW()) OR (j.status='RUNNING' AND j."leaseUntil"<NOW()))
        AND NOT EXISTS (SELECT 1 FROM "ChatJob" other WHERE other."threadId"=j."threadId" AND other.status='RUNNING' AND other."leaseUntil">NOW())
        ORDER BY j."dueAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING id`;
    });
    if (!rows.length) return;
    const job = await this.prisma.chatJob.findUniqueOrThrow({
      where: { id: rows[0].id },
    });
    try {
      if (job.kind === 'PUSH') {
        await this.push.send(job.threadId);
        await this.prisma.chatJob.updateMany({
          where: { id: job.id, leaseToken },
          data: { status: 'DONE', leaseUntil: null },
        });
        return;
      }
      const thread = await this.prisma.chatThread.findUniqueOrThrow({
        where: { id: job.threadId },
        include: {
          ...threadInclude,
          user: {
            select: { name: true, profile: { select: { level: true } } },
          },
        },
      });
      const prefs = await this.chat.preferences(thread.userId);
      const now = new Date();
      const quiet = quietHour(
        localClock(now, prefs.timezone).hour,
        prefs.quietStart,
        prefs.quietEnd,
      );
      const cancelled =
        thread.archived ||
        (job.kind === 'REPLY' &&
          job.triggerSequence <= thread.repliedThrough) ||
        (job.kind === 'PROACTIVE' &&
          (!prefs.enabled ||
            !thread.proactiveEnabled ||
            quiet ||
            thread.unattendedRounds >= 2 ||
            thread.lastSequence !== job.triggerSequence ||
            process.env.CHAT_PROACTIVE_ENABLED !== 'true'));
      if (cancelled) {
        await this.prisma.chatJob.updateMany({
          where: { id: job.id, leaseToken },
          data: { status: 'CANCELLED', leaseUntil: null },
        });
        return;
      }
      const members = thread.members.map((m) => m.character);
      const recent = (
        await this.prisma.chatMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { sequence: 'desc' },
          take: 30,
        })
      ).reverse();
      const result = await this.ai.reply({
        kind: thread.kind,
        romance: thread.romance,
        members,
        memory: thread.memory,
        messages: recent,
        learner: thread.user,
        proactive: job.kind === 'PROACTIVE',
        now: now.toISOString(),
      });
      const ids = new Set(members.map((m) => m.id));
      if (
        result.messages.some((m) => !ids.has(m.characterId)) ||
        (thread.kind === 'GROUP' &&
          (result.messages.length < 2 ||
            new Set(result.messages.map((m) => m.characterId)).size < 2)) ||
        (thread.kind === 'DIRECT' && result.messages.length > 2)
      )
        throw new Error('AI trả lời sai thành viên hoặc số lượng tin');
      let memory: string | undefined;
      let memoryThrough = thread.memoryThrough;
      if (thread.lastSequence - thread.memoryThrough >= 20) {
        // Include EVERY unsummarized message, not just the recent context window.
        const unsummarized = await this.prisma.chatMessage.findMany({
          where: {
            threadId: thread.id,
            sequence: { gt: thread.memoryThrough, lte: thread.lastSequence },
          },
          orderBy: { sequence: 'asc' },
          take: 100,
        });
        if (unsummarized.length) {
          const summary = await this.ai.generate(
            'Update this conversation-only memory in English. Preserve names, established character life events, learner preferences and unresolved plans. Do not invent facts. Max 1200 words. Return {memory}.',
            { previous: thread.memory, messages: unsummarized },
            z.object({ memory: z.string().max(8000) }),
          );
          memory = summary.memory;
          memoryThrough = unsummarized[unsummarized.length - 1].sequence;
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${thread.userId} FOR UPDATE`;
        await this.chat.lock(tx, thread.userId, thread.id);
        const leased = await tx.chatJob.updateMany({
          where: {
            id: job.id,
            leaseToken,
            status: 'RUNNING',
            leaseUntil: { gt: new Date() },
          },
          data: { status: 'DONE', leaseUntil: null },
        });
        if (!leased.count) return;
        const current = await tx.chatThread.findUniqueOrThrow({
          where: { id: thread.id },
        });
        const currentPrefs = await tx.chatPreferences.findUniqueOrThrow({
          where: { userId: thread.userId },
        });
        const currentlyQuiet = quietHour(
          localClock(new Date(), currentPrefs.timezone).hour,
          currentPrefs.quietStart,
          currentPrefs.quietEnd,
        );
        if (
          current.archived ||
          current.revision !== thread.revision ||
          (job.kind === 'PROACTIVE' &&
            (!currentPrefs.enabled ||
              !current.proactiveEnabled ||
              currentlyQuiet ||
              current.unattendedRounds >= 2 ||
              current.lastSequence !== job.triggerSequence))
        ) {
          await tx.chatJob.update({
            where: { id: job.id },
            data: { status: 'CANCELLED' },
          });
          if (job.kind === 'REPLY' && !current.archived)
            await tx.chatJob.create({
              data: {
                key: `reply:${thread.id}:revision:${current.revision}:${current.lastSequence}`,
                threadId: thread.id,
                kind: 'REPLY',
                triggerSequence: current.lastSequence,
                dueAt: new Date(),
              },
            });
          return;
        }
        for (const [index, message] of result.messages.entries())
          await tx.chatMessage.create({
            data: {
              ...message,
              role: 'CHARACTER',
              threadId: thread.id,
              sequence: current.lastSequence + index + 1,
            },
          });
        await tx.chatThread.update({
          where: { id: thread.id },
          data: {
            lastSequence: { increment: result.messages.length },
            ...(job.kind === 'REPLY'
              ? { repliedThrough: thread.lastSequence }
              : { unattendedRounds: { increment: 1 } }),
            ...(memory === undefined ? {} : { memory, memoryThrough }),
          },
        });
        await tx.chatJob.create({
          data: {
            threadId: thread.id,
            key: `push:${job.id}`,
            kind: 'PUSH',
            dueAt: new Date(),
          },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Chat job ${job.id}: ${error instanceof Error ? error.message : 'failed'}`,
      );
      await this.prisma.chatJob.updateMany({
        where: { id: job.id, leaseToken, status: 'RUNNING' },
        data: {
          status: job.attempts >= 3 ? 'FAILED' : 'PENDING',
          error: 'Không xử lý được tin nhắn',
          leaseUntil: null,
          dueAt: new Date(Date.now() + 10000 * job.attempts),
        },
      });
    }
  }
}
