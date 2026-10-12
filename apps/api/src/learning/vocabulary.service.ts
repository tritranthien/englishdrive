import { Injectable, NotFoundException } from '@nestjs/common';
import type { VocabularyItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { memoryKey } from './learning-memory.service.js';
import type {
  VocabularyListInput,
  VocabularyWordInput,
} from './vocabulary.schemas.js';

function serialize(item: VocabularyItem) {
  return {
    id: item.id,
    key: item.termKey,
    term: item.term,
    meaningVi: item.meaningVi,
    example: item.example,
    savedAt: item.createdAt.getTime(),
    updatedAt: item.updatedAt.getTime(),
  };
}

@Injectable()
export class VocabularyService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, input: VocabularyListInput) {
    // Never let an arbitrary cursor select another user's row.
    if (
      input.cursor &&
      !(await this.prisma.vocabularyItem.findFirst({
        where: { id: input.cursor, userId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Không tìm thấy từ vựng');
    const rows = await this.prisma.vocabularyItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, input.limit);
    return {
      items: items.map(serialize),
      nextCursor: rows.length > input.limit ? items[items.length - 1].id : null,
    };
  }

  async save(userId: string, input: VocabularyWordInput) {
    const item = await this.prisma.vocabularyItem.upsert({
      where: { userId_termKey: { userId, termKey: memoryKey(input.term) } },
      create: {
        userId,
        termKey: memoryKey(input.term),
        term: input.term,
        meaningVi: input.meaningVi,
        example: input.example ?? '',
        pinned: true,
      },
      update: {
        term: input.term,
        meaningVi: input.meaningVi,
        ...(input.example ? { example: input.example } : {}),
        pinned: true,
        lastSeenAt: new Date(),
      },
    });
    return serialize(item);
  }

  async import(userId: string, words: VocabularyWordInput[]) {
    // Imports may retry after a disconnect. Existing server meanings/examples
    // win over an older phone copy; unique account+term keys make retries safe.
    const unique = [
      ...new Map(words.map((word) => [memoryKey(word.term), word])).values(),
    ];
    await this.prisma.$transaction(
      unique.map((word) =>
        this.prisma.vocabularyItem.upsert({
          where: { userId_termKey: { userId, termKey: memoryKey(word.term) } },
          create: {
            userId,
            termKey: memoryKey(word.term),
            term: word.term,
            meaningVi: word.meaningVi,
            example: word.example ?? '',
            pinned: true,
          },
          update: { pinned: true },
        }),
      ),
    );
    return { imported: unique.length };
  }

  async remove(userId: string, id: string) {
    await this.prisma.vocabularyItem.deleteMany({ where: { userId, id } });
    return { deleted: true };
  }
}
