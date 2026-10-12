import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SessionAnalysisOutput } from '../analysis/session-analysis.schemas.js';
import { LearningMemoryService } from './learning-memory.service.js';

describe('manual vocabulary preservation', () => {
  it('keeps pinned words when a reanalysis removes their last session reference', async () => {
    const transaction = {
      conversationSession: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ userId: 'owner', endedAt: new Date() }),
      },
      sessionMistake: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
      sessionVocabulary: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ vocabularyItemId: 'saved-word' }]),
        deleteMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      vocabularyItem: { deleteMany: vi.fn(), updateMany: vi.fn() },
    };
    const service = new LearningMemoryService({} as PrismaService);
    await service.ingestInTransaction(
      transaction as unknown as Prisma.TransactionClient,
      'session',
      {
        grammarIssues: [],
        newVocabulary: [],
      } as unknown as SessionAnalysisOutput,
    );
    expect(transaction.vocabularyItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'saved-word', pinned: false },
    });
    expect(transaction.vocabularyItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'saved-word', pinned: true },
      data: { occurrenceCount: 0 },
    });
  });
});
