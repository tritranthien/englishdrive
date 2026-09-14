import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LearningContextSnapshot } from './learning-context.types.js';

const LIMITS = {
  mistakes: 3,
  vocabulary: 5,
  analyses: 2,
  focus: 2,
  topics: 4,
  summaryLength: 300,
} as const;

function strings(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

@Injectable()
export class LearningContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(userId: string): Promise<LearningContextSnapshot> {
    const [mistakes, vocabulary, analyses] = await Promise.all([
      this.prisma.mistake.findMany({
        where: { userId, occurrenceCount: { gt: 0 } },
        orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }],
        take: LIMITS.mistakes,
      }),
      this.prisma.vocabularyItem.findMany({
        where: { userId, occurrenceCount: { gt: 0 }, familiarity: { lt: 0.9 } },
        orderBy: [{ nextReviewAt: 'asc' }, { lastSeenAt: 'desc' }],
        take: LIMITS.vocabulary,
      }),
      this.prisma.sessionAnalysis.findMany({
        where: { status: 'COMPLETED', session: { userId } },
        orderBy: { completedAt: 'desc' },
        take: LIMITS.analyses,
        select: {
          summary: true,
          mainTopics: true,
          nextSessionFocus: true,
        },
      }),
    ]);

    const currentFocus = this.unique(
      analyses.flatMap((analysis) =>
        strings(analysis.nextSessionFocus, LIMITS.focus),
      ),
      LIMITS.focus,
    );
    const recentTopics = this.unique(
      analyses.flatMap((analysis) =>
        strings(analysis.mainTopics, LIMITS.topics),
      ),
      LIMITS.topics,
    );

    return {
      currentFocus,
      recurringMistakes: mistakes.map((mistake) => ({
        pattern: mistake.pattern,
        occurrenceCount: mistake.occurrenceCount,
        suggestion: mistake.latestSuggestion.slice(0, 200),
      })),
      reviewVocabulary: vocabulary.map((item) => ({
        term: item.term,
        meaningVi: item.meaningVi.slice(0, 160),
        example: item.example.slice(0, 200),
      })),
      recentTopics,
      recentSessionSummaries: analyses
        .map((analysis) => analysis.summary?.trim())
        .filter((summary): summary is string => Boolean(summary))
        .map((summary) => summary.slice(0, LIMITS.summaryLength)),
    };
  }

  format(snapshot: LearningContextSnapshot) {
    const lines = [
      'Personal learning context. Use it subtly and never announce a quiz:',
    ];
    if (snapshot.currentFocus.length)
      lines.push(`Current focus: ${snapshot.currentFocus.join('; ')}`);
    if (snapshot.recurringMistakes.length)
      lines.push(
        `Recurring patterns: ${snapshot.recurringMistakes
          .map((item) => `${item.pattern} (${item.occurrenceCount} sessions)`)
          .join('; ')}`,
      );
    if (snapshot.reviewVocabulary.length)
      lines.push(
        `Words to reintroduce naturally: ${snapshot.reviewVocabulary
          .map((item) => `${item.term} (${item.meaningVi})`)
          .join('; ')}`,
      );
    if (snapshot.recentTopics.length)
      lines.push(`Recent topics: ${snapshot.recentTopics.join('; ')}`);
    if (snapshot.recentSessionSummaries.length)
      lines.push(
        `Recent learning summaries: ${snapshot.recentSessionSummaries.join(' | ')}`,
      );
    lines.push(
      'Select at most two learning goals. Reuse prior vocabulary only when it fits the conversation. Do not mention stored memory or force every item into this session.',
    );
    return lines.join('\n');
  }

  private unique(items: string[], limit: number) {
    return [...new Set(items.map((item) => item.toLocaleLowerCase('en-US')))]
      .slice(0, limit)
      .map(
        (key) => items.find((item) => item.toLocaleLowerCase('en-US') === key)!,
      );
  }
}
