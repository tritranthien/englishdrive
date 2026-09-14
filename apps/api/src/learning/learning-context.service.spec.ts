import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { LearningContextService } from './learning-context.service.js';

describe('LearningContextService', () => {
  it('builds a bounded snapshot and formats subtle tutor guidance', async () => {
    const prisma = {
      mistake: {
        findMany: vi.fn().mockResolvedValue([
          {
            pattern: 'past tense',
            occurrenceCount: 3,
            latestSuggestion: 'I went to work.',
          },
        ]),
      },
      vocabularyItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            term: 'deployment',
            meaningVi: 'triển khai',
            example: 'The deployment went well.',
          },
        ]),
      },
      sessionAnalysis: {
        findMany: vi.fn().mockResolvedValue([
          {
            summary: 'Người học đã nói về công việc.',
            mainTopics: ['work', 'backend'],
            nextSessionFocus: ['past tense', 'articles', 'extra ignored'],
          },
          {
            summary: 'Người học đã giải thích một sự cố.',
            mainTopics: ['work', 'incident'],
            nextSessionFocus: ['past tense'],
          },
        ]),
      },
    } as unknown as PrismaService;
    const service = new LearningContextService(prisma);

    const snapshot = await service.build('user-id');

    expect(snapshot.currentFocus).toEqual(['past tense', 'articles']);
    expect(snapshot.recentTopics).toEqual(['work', 'backend', 'incident']);
    expect(snapshot.recurringMistakes).toHaveLength(1);
    expect(snapshot.reviewVocabulary).toHaveLength(1);
    expect(service.format(snapshot)).toContain(
      'Words to reintroduce naturally: deployment (triển khai)',
    );
    expect(prisma.mistake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(prisma.vocabularyItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    expect(prisma.sessionAnalysis.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });
});
