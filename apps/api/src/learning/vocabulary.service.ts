import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VocabularyItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { memoryKey } from './learning-memory.service.js';
import type {
  VocabularyListInput,
  VocabularyWordInput,
  VocabularyAssignmentInput,
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
    deckId: item.deckId ?? null,
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
    if (input.deckId) {
      const deck = await this.prisma.vocabularyDeck.findFirst({
        where: { id: input.deckId, userId },
        select: { id: true },
      });
      if (!deck) throw new NotFoundException('Không tìm thấy bộ từ vựng');
    }
    const item = await this.prisma.vocabularyItem.upsert({
      where: { userId_termKey: { userId, termKey: memoryKey(input.term) } },
      create: {
        userId,
        termKey: memoryKey(input.term),
        term: input.term,
        meaningVi: input.meaningVi,
        example: input.example ?? '',
        pinned: true,
        deckId: input.deckId ?? null,
      },
      update: {
        ...(input.deckId !== undefined ? { deckId: input.deckId } : {}),
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

  async listDecks(userId: string) {
    const decks = await this.prisma.vocabularyDeck.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { words: true } } },
    });
    return {
      items: decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        wordCount: deck._count.words,
        createdAt: deck.createdAt.getTime(),
        updatedAt: deck.updatedAt.getTime(),
      })),
    };
  }

  private deckConflict(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException('Bạn đã có bộ từ vựng mang tên này');
    throw error;
  }

  async createDeck(userId: string, inputName: string) {
    const name = inputName.trim().replace(/\s+/g, ' ');
    try {
      const deck = await this.prisma.vocabularyDeck.create({
        data: { userId, name, nameKey: memoryKey(name) },
      });
      return {
        id: deck.id,
        name: deck.name,
        wordCount: 0,
        createdAt: deck.createdAt.getTime(),
        updatedAt: deck.updatedAt.getTime(),
      };
    } catch (error) {
      return this.deckConflict(error);
    }
  }

  async renameDeck(userId: string, id: string, inputName: string) {
    const name = inputName.trim().replace(/\s+/g, ' ');
    try {
      const result = await this.prisma.vocabularyDeck.updateMany({
        where: { userId, id },
        data: { name, nameKey: memoryKey(name) },
      });
      if (!result.count)
        throw new NotFoundException('Không tìm thấy bộ từ vựng');
      return { updated: true };
    } catch (error) {
      return this.deckConflict(error);
    }
  }

  async deleteDeck(userId: string, id: string) {
    // The foreign key moves words to Unclassified instead of deleting them.
    await this.prisma.vocabularyDeck.deleteMany({ where: { userId, id } });
    return { deleted: true };
  }

  async assign(userId: string, input: VocabularyAssignmentInput) {
    const ids = [...new Set(input.wordIds)];
    return this.prisma.$transaction(async (transaction) => {
      if (
        input.deckId &&
        !(await transaction.vocabularyDeck.findFirst({
          where: { id: input.deckId, userId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Không tìm thấy bộ từ vựng');
      const count = await transaction.vocabularyItem.count({
        where: { userId, id: { in: ids } },
      });
      if (count !== ids.length)
        throw new NotFoundException('Không tìm thấy từ vựng đã chọn');
      const result = await transaction.vocabularyItem.updateMany({
        where: { userId, id: { in: ids } },
        data: { deckId: input.deckId, pinned: true },
      });
      if (result.count !== ids.length)
        throw new NotFoundException('Không tìm thấy từ vựng đã chọn');
      return { moved: result.count };
    });
  }
}
