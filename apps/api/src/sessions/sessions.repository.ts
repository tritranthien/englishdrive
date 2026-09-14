import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateSessionInput,
  TranscriptMessageInput,
} from './sessions.schemas.js';

@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, input: CreateSessionInput) {
    return this.prisma.conversationSession.create({
      data: { userId, type: input.type },
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.conversationSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
  }

  findForUser(id: string, userId: string) {
    return this.prisma.conversationSession.findFirst({
      where: { id, userId },
    });
  }

  findDetailsForUser(id: string, userId: string) {
    return this.prisma.conversationSession.findFirst({
      where: { id, userId },
      include: {
        transcript: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  setProvider(id: string, provider: string, model: string) {
    return this.prisma.conversationSession.update({
      where: { id },
      data: { provider, model },
    });
  }

  appendTranscript(id: string, messages: TranscriptMessageInput[]) {
    return this.prisma.transcriptMessage.createMany({
      data: messages.map((message) => ({
        sessionId: id,
        clientMessageId: message.clientMessageId,
        role: message.role,
        content: message.content,
        occurredAt: new Date(message.occurredAt),
      })),
      skipDuplicates: true,
    });
  }

  async complete(
    id: string,
    endedAt: Date,
    durationSeconds: number,
    messages: TranscriptMessageInput[],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      if (messages.length > 0) {
        await transaction.transcriptMessage.createMany({
          data: messages.map((message) => ({
            sessionId: id,
            clientMessageId: message.clientMessageId,
            role: message.role,
            content: message.content,
            occurredAt: new Date(message.occurredAt),
          })),
          skipDuplicates: true,
        });
      }
      return transaction.conversationSession.update({
        where: { id },
        data: { status: 'COMPLETED', endedAt, durationSeconds },
        include: {
          transcript: {
            orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }
}
