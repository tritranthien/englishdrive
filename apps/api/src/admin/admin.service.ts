import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseEnvironment } from '../config/env.js';
import type { AdminQuery } from './admin.controller.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;
const sessionSelect = {
  id: true,
  status: true,
  type: true,
  provider: true,
  model: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  summary: true,
  user: { select: userSelect },
  analysis: { select: { status: true, attempts: true } },
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const since = new Date(Date.now() - 7 * 86400_000);
    const [
      users,
      sessions,
      active,
      failedAnalyses,
      lastWeek,
      duration,
      recent,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.conversationSession.count(),
      this.prisma.conversationSession.count({ where: { status: 'ACTIVE' } }),
      this.prisma.sessionAnalysis.count({ where: { status: 'FAILED' } }),
      this.prisma.conversationSession.count({
        where: { startedAt: { gte: since } },
      }),
      this.prisma.conversationSession.aggregate({
        _sum: { durationSeconds: true },
      }),
      this.prisma.conversationSession.findMany({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 8,
        select: sessionSelect,
      }),
    ]);
    const env = parseEnvironment(process.env);
    return {
      users,
      sessions,
      active,
      failedAnalyses,
      lastWeek,
      minutes: Math.round((duration._sum.durationSeconds ?? 0) / 60),
      recent,
      server: {
        database: 'connected',
        provider: env.LIVE_PROVIDER,
        liveModel: env.GEMINI_LIVE_MODEL,
        analysisModel: env.GEMINI_ANALYSIS_MODEL,
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        openaiConfigured: Boolean(env.OPENAI_API_KEY),
      },
    };
  }

  async users({ page, search }: AdminQuery) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          ...userSelect,
          profile: { select: { level: true, languageMode: true } },
          _count: { select: { sessions: true } },
        },
      }),
    ]);
    return { total, items, page, pageSize: 20 };
  }

  async sessions({ page, search, status }: AdminQuery) {
    const where: Prisma.ConversationSessionWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            user: {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.conversationSession.count({ where }),
      this.prisma.conversationSession.findMany({
        where,
        skip: (page - 1) * 20,
        take: 20,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: sessionSelect,
      }),
    ]);
    return { total, items, page, pageSize: 20 };
  }

  async session(id: string) {
    const session = await this.prisma.conversationSession.findUnique({
      where: { id },
      select: {
        ...sessionSelect,
        analysis: {
          select: {
            status: true,
            summary: true,
            errorMessage: true,
            attempts: true,
            mainTopics: true,
            grammarIssues: true,
            newVocabulary: true,
            strengths: true,
            nextSessionFocus: true,
          },
        },
        transcript: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          take: 500,
          select: { id: true, role: true, content: true, occurredAt: true },
        },
        _count: { select: { transcript: true } },
      },
    });
    if (!session) throw new NotFoundException('Không tìm thấy phiên học');
    return session;
  }
}
