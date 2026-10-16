import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { chatCatalog } from './chat.catalog.js';
import { ChatAiService } from './chat-ai.service.js';
import {
  nextContact,
  type CharacterInput,
  preferencesSchema,
  threadSchema,
  threadPatchSchema,
} from './chat.schemas.js';

export const threadInclude = {
  members: { include: { character: true } },
} satisfies Prisma.ChatThreadInclude;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: ChatAiService,
  ) {}

  catalog() {
    return chatCatalog;
  }
  characters(userId: string) {
    return this.prisma.chatCharacter.findMany({
      where: { userId, archived: false },
      orderBy: { createdAt: 'asc' },
    });
  }
  async character(userId: string, id: string) {
    const character = await this.prisma.chatCharacter.findFirst({
      where: { id, userId, archived: false },
    });
    if (!character) throw new NotFoundException('Không tìm thấy nhân vật');
    return character;
  }
  async addCharacter(
    userId: string,
    input: CharacterInput | { templateId: string },
  ) {
    if ('templateId' in input) {
      const template = chatCatalog.find((c) => c.id === input.templateId);
      if (!template) throw new NotFoundException('Không tìm thấy nhân vật mẫu');
      const { id: templateId, ...data } = template;
      return this.prisma.chatCharacter.upsert({
        where: { userId_templateId: { userId, templateId } },
        create: { ...data, userId, templateId },
        update: { archived: false },
      });
    }
    return this.prisma.chatCharacter.create({ data: { ...input, userId } });
  }
  async editCharacter(userId: string, id: string, input: CharacterInput) {
    await this.character(userId, id);
    return this.prisma.chatCharacter.update({ where: { id }, data: input });
  }
  preferences(userId: string) {
    return this.prisma.chatPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }
  async savePreferences(
    userId: string,
    input: z.infer<typeof preferencesSchema>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const prefs = await tx.chatPreferences.upsert({
        where: { userId },
        create: { ...input, userId },
        update: input,
      });
      const threads = await tx.chatThread.findMany({
        where: { userId, archived: false },
      });
      for (const thread of threads)
        await tx.chatThread.update({
          where: { id: thread.id },
          data: {
            nextProactiveAt: nextContact(
              thread.minMinutes ?? prefs.minMinutes,
              thread.maxMinutes ?? prefs.maxMinutes,
            ),
            revision: { increment: 1 },
          },
        });
      return prefs;
    });
  }
  async thread(userId: string, id: string) {
    const thread = await this.prisma.chatThread.findFirst({
      where: { id, userId },
      include: threadInclude,
    });
    if (!thread) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    return thread;
  }
  async threads(userId: string) {
    const threads = await this.prisma.chatThread.findMany({
      where: { userId, archived: false },
      include: {
        ...threadInclude,
        messages: { orderBy: { sequence: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return Promise.all(
      threads.map(async (thread) => ({
        ...thread,
        unread: await this.prisma.chatMessage.count({
          where: {
            threadId: thread.id,
            role: 'CHARACTER',
            sequence: { gt: thread.lastReadSequence },
          },
        }),
      })),
    );
  }
  private async validateMembers(userId: string, ids: string[]) {
    const count = await this.prisma.chatCharacter.count({
      where: { id: { in: ids }, userId, archived: false },
    });
    if (count !== ids.length)
      throw new BadRequestException('Chỉ được chọn nhân vật của bạn');
  }
  async createThread(userId: string, input: z.infer<typeof threadSchema>) {
    await this.validateMembers(userId, input.characterIds);
    const prefs = await this.preferences(userId);
    const data = {
      userId,
      kind: input.kind,
      title: input.title,
      nextProactiveAt: nextContact(prefs.minMinutes, prefs.maxMinutes),
      members: {
        create: input.characterIds.map((characterId) => ({ characterId })),
      },
    };
    if (input.kind === 'DIRECT')
      return this.prisma.chatThread.upsert({
        where: {
          userId_directCharacterId: {
            userId,
            directCharacterId: input.characterIds[0],
          },
        },
        create: { ...data, directCharacterId: input.characterIds[0] },
        update: { archived: false },
        include: threadInclude,
      });
    return this.prisma.chatThread.create({ data, include: threadInclude });
  }
  async updateThread(
    userId: string,
    id: string,
    input: z.infer<typeof threadPatchSchema>,
  ) {
    const thread = await this.thread(userId, id);
    if (thread.kind !== 'DIRECT' && input.romance)
      throw new BadRequestException('Chế độ hẹn hò chỉ áp dụng cho chat riêng');
    if (thread.kind !== 'GROUP' && input.characterIds)
      throw new BadRequestException('Không thể đổi thành viên chat riêng');
    if (input.characterIds)
      await this.validateMembers(userId, input.characterIds);
    const prefs = await this.preferences(userId);
    const { characterIds, ...data } = input;
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId, id);
      const current = await tx.chatThread.findUniqueOrThrow({ where: { id } });
      if (characterIds) {
        await tx.chatMember.deleteMany({ where: { threadId: id } });
        await tx.chatMember.createMany({
          data: characterIds.map((characterId) => ({
            threadId: id,
            characterId,
          })),
        });
      }
      return tx.chatThread.update({
        where: { id },
        data: {
          ...data,
          revision: { increment: 1 },
          nextProactiveAt: nextContact(
            input.minMinutes === undefined
              ? (current.minMinutes ?? prefs.minMinutes)
              : (input.minMinutes ?? prefs.minMinutes),
            input.maxMinutes === undefined
              ? (current.maxMinutes ?? prefs.maxMinutes)
              : (input.maxMinutes ?? prefs.maxMinutes),
          ),
        },
        include: threadInclude,
      });
    });
  }
  async lock(tx: Prisma.TransactionClient, userId: string, id: string) {
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "ChatThread" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
  }
  async messages(userId: string, id: string, before?: number, after?: number) {
    const thread = await this.thread(userId, id);
    const where = {
      threadId: id,
      sequence: {
        ...(before ? { lt: before } : {}),
        ...(after != null ? { gt: after } : {}),
      },
    };
    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { sequence: after != null ? 'asc' : 'desc' },
      take: 51,
    });
    const hasMore = messages.length > 50;
    const items = messages.slice(0, 50);
    if (after == null) items.reverse();
    const job = await this.prisma.chatJob.findFirst({
      where: {
        threadId: id,
        kind: 'REPLY',
        triggerSequence: { gt: thread.repliedThrough },
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true, error: true },
    });
    return {
      items,
      hasMore,
      thread,
      replyStatus: job?.status ?? 'IDLE',
      replyError:
        job?.status === 'FAILED'
          ? 'Chưa nhận được trả lời. Bạn có thể thử lại.'
          : null,
    };
  }
  async send(
    userId: string,
    id: string,
    clientMessageId: string,
    content: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId, id);
      const duplicate = await tx.chatMessage.findUnique({
        where: { threadId_clientMessageId: { threadId: id, clientMessageId } },
      });
      if (duplicate) return duplicate;
      const thread = await tx.chatThread.findUniqueOrThrow({ where: { id } });
      if (thread.archived)
        throw new BadRequestException(
          'Hãy mở lại cuộc trò chuyện trước khi gửi tin',
        );
      const count = await tx.chatMessage.count({
        where: {
          threadId: id,
          role: 'USER',
          createdAt: { gte: new Date(Date.now() - 60000) },
        },
      });
      if (count >= 20)
        throw new BadRequestException(
          'Bạn đang gửi quá nhanh, hãy chờ một chút',
        );
      const updated = await tx.chatThread.update({
        where: { id },
        data: { lastSequence: { increment: 1 }, unattendedRounds: 0 },
      });
      const message = await tx.chatMessage.create({
        data: {
          threadId: id,
          clientMessageId,
          content,
          sequence: updated.lastSequence,
          role: 'USER',
        },
      });
      await tx.chatJob.create({
        data: {
          threadId: id,
          kind: 'REPLY',
          key: `reply:${id}:${message.sequence}`,
          triggerSequence: message.sequence,
          dueAt: new Date(Date.now() + 2000 + Math.random() * 4000),
        },
      });
      return message;
    });
  }
  async read(userId: string, id: string, sequence: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId, id);
      const thread = await tx.chatThread.findUniqueOrThrow({ where: { id } });
      return tx.chatThread.update({
        where: { id },
        data: {
          lastReadSequence: Math.max(
            thread.lastReadSequence,
            Math.min(sequence, thread.lastSequence),
          ),
          unattendedRounds: 0,
          updatedAt: thread.updatedAt,
        },
      });
    });
  }
  async retry(userId: string, id: string) {
    const thread = await this.thread(userId, id);
    return this.prisma.chatJob.updateMany({
      where: {
        threadId: id,
        kind: 'REPLY',
        status: 'FAILED',
        triggerSequence: { gt: thread.repliedThrough },
      },
      data: { status: 'PENDING', attempts: 0, error: null, dueAt: new Date() },
    });
  }
  async help(
    userId: string,
    id: string,
    action: 'translate' | 'explain' | 'suggest',
    messageId?: string,
  ) {
    const thread = await this.thread(userId, id);
    const selected = messageId
      ? await this.prisma.chatMessage.findFirst({
          where: { id: messageId, threadId: id },
        })
      : null;
    if (action !== 'suggest' && !selected)
      throw new NotFoundException('Không tìm thấy tin nhắn');
    const key = `help:${id}:${action}:${messageId ?? thread.lastSequence}`;
    const cached = await this.prisma.chatJob.findUnique({ where: { key } });
    if (cached?.status === 'DONE' && cached.payload) return cached.payload;
    const count = await this.prisma.chatJob.count({
      where: {
        kind: 'HELP',
        thread: { userId },
        createdAt: { gte: new Date(Date.now() - 3600000) },
      },
    });
    if (count >= 60)
      throw new BadRequestException(
        'Bạn đã dùng nhiều trợ giúp, hãy thử lại sau',
      );
    const job = await this.prisma.chatJob.upsert({
      where: { key },
      create: {
        key,
        threadId: id,
        kind: 'HELP',
        status: 'HELP',
        dueAt: new Date(),
      },
      update: {},
    });
    const context =
      action === 'suggest'
        ? await this.prisma.chatMessage.findMany({
            where: { threadId: id },
            orderBy: { sequence: 'desc' },
            take: 8,
          })
        : selected;
    const output = await this.ai.generate(
      action === 'translate'
        ? 'Translate the selected message into natural Vietnamese. Return {text}.'
        : action === 'explain'
          ? 'Explain the selected English message and useful expressions briefly in Vietnamese. Return {text}.'
          : 'Suggest ONE short natural English reply for the learner to send to this conversation. Do not send it. Return {text}.',
      context,
      z.object({ text: z.string().min(1).max(3000) }),
    );
    await this.prisma.chatJob.update({
      where: { id: job.id },
      data: { status: 'DONE', payload: output },
    });
    return output;
  }
  async registerDevice(userId: string, token: string, installationId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.chatDevice.deleteMany({
        where: { token, NOT: { installationId } },
      });
      await tx.chatDevice.upsert({
        where: { installationId },
        create: { userId, token, installationId },
        update: { userId, token },
      });
    });
    return { ok: true };
  }
  async unregisterDevice(userId: string, installationId: string) {
    await this.prisma.chatDevice.deleteMany({
      where: { userId, installationId },
    });
    return { ok: true };
  }
}
