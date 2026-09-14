import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionAnalysisOutput } from '../analysis/session-analysis.schemas.js';

function memoryKey(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

@Injectable()
export class LearningMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(sessionId: string, output: SessionAnalysisOutput) {
    await this.prisma.$transaction((transaction) =>
      this.ingestInTransaction(transaction, sessionId, output),
    );
  }

  async ingestInTransaction(
    transaction: Prisma.TransactionClient,
    sessionId: string,
    output: SessionAnalysisOutput,
  ) {
    const session = await transaction.conversationSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, endedAt: true },
    });
    if (!session) return;

    const [oldMistakes, oldVocabulary] = await Promise.all([
      transaction.sessionMistake.findMany({
        where: { sessionId },
        select: { mistakeId: true },
      }),
      transaction.sessionVocabulary.findMany({
        where: { sessionId },
        select: { vocabularyItemId: true },
      }),
    ]);
    await Promise.all([
      transaction.sessionMistake.deleteMany({ where: { sessionId } }),
      transaction.sessionVocabulary.deleteMany({ where: { sessionId } }),
    ]);

    const seenAt = session.endedAt ?? new Date();
    const affectedMistakes = new Set(oldMistakes.map((item) => item.mistakeId));
    const affectedVocabulary = new Set(
      oldVocabulary.map((item) => item.vocabularyItemId),
    );

    for (const issue of this.uniqueByKey(
      output.grammarIssues,
      (item) => item.pattern,
    )) {
      const patternKey = memoryKey(issue.pattern);
      if (!patternKey) continue;
      const mistake = await transaction.mistake.upsert({
        where: { userId_patternKey: { userId: session.userId, patternKey } },
        create: {
          userId: session.userId,
          patternKey,
          pattern: issue.pattern,
          latestOriginal: issue.original,
          latestSuggestion: issue.suggestion,
          explanationVi: issue.explanationVi,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
        },
        update: {
          pattern: issue.pattern,
          latestOriginal: issue.original,
          latestSuggestion: issue.suggestion,
          explanationVi: issue.explanationVi,
          lastSeenAt: seenAt,
        },
      });
      affectedMistakes.add(mistake.id);
      await transaction.sessionMistake.create({
        data: {
          sessionId,
          mistakeId: mistake.id,
          original: issue.original,
          suggestion: issue.suggestion,
          explanationVi: issue.explanationVi,
        },
      });
    }

    for (const word of this.uniqueByKey(
      output.newVocabulary,
      (item) => item.term,
    )) {
      const termKey = memoryKey(word.term);
      if (!termKey) continue;
      const vocabulary = await transaction.vocabularyItem.upsert({
        where: { userId_termKey: { userId: session.userId, termKey } },
        create: {
          userId: session.userId,
          termKey,
          term: word.term,
          meaningVi: word.meaningVi,
          example: word.example,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
          nextReviewAt: seenAt,
        },
        update: {
          term: word.term,
          meaningVi: word.meaningVi,
          example: word.example,
          lastSeenAt: seenAt,
        },
      });
      affectedVocabulary.add(vocabulary.id);
      await transaction.sessionVocabulary.create({
        data: { sessionId, vocabularyItemId: vocabulary.id },
      });
    }

    await this.refreshCounts(transaction, affectedMistakes, affectedVocabulary);
  }

  private uniqueByKey<T>(items: T[], readValue: (item: T) => string) {
    const unique = new Map<string, T>();
    for (const item of items) {
      const key = memoryKey(readValue(item));
      if (key && !unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
  }

  private async refreshCounts(
    transaction: Prisma.TransactionClient,
    mistakeIds: Set<string>,
    vocabularyIds: Set<string>,
  ) {
    for (const id of mistakeIds) {
      const occurrenceCount = await transaction.sessionMistake.count({
        where: { mistakeId: id },
      });
      if (occurrenceCount === 0) {
        await transaction.mistake.delete({ where: { id } });
      } else {
        await transaction.mistake.update({
          where: { id },
          data: { occurrenceCount },
        });
      }
    }
    for (const id of vocabularyIds) {
      const occurrenceCount = await transaction.sessionVocabulary.count({
        where: { vocabularyItemId: id },
      });
      if (occurrenceCount === 0) {
        await transaction.vocabularyItem.delete({ where: { id } });
      } else {
        await transaction.vocabularyItem.update({
          where: { id },
          data: { occurrenceCount },
        });
      }
    }
  }
}
