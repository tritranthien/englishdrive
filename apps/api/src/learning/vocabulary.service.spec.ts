import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VocabularyService } from './vocabulary.service.js';
import {
  vocabularyImportSchema,
  vocabularyWordSchema,
  vocabularyDeckSchema,
  vocabularyAssignmentSchema,
} from './vocabulary.schemas.js';

const item = {
  id: 'word-1',
  termKey: 'commute',
  term: 'commute',
  meaningVi: 'đi làm',
  example: 'I commute by bus.',
  createdAt: new Date(1_000),
  updatedAt: new Date(2_000),
};
function setup() {
  const delegates = {
    vocabularyItem: {
      findMany: vi.fn().mockResolvedValue([item]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(item),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    vocabularyDeck: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'deck',
        name: 'Công việc',
        createdAt: new Date(1),
        updatedAt: new Date(2),
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ...delegates,
    $transaction: vi.fn(
      async (
        operation:
          | Promise<unknown>[]
          | ((transaction: typeof delegates) => Promise<unknown>),
      ) =>
        typeof operation === 'function'
          ? operation(delegates)
          : Promise.all(operation),
    ),
  };
  return {
    prisma,
    service: new VocabularyService(prisma as unknown as PrismaService),
  };
}

describe('account vocabulary', () => {
  it('lists only the authenticated owner and produces a bounded cursor page', async () => {
    const { prisma, service } = setup();
    prisma.vocabularyItem.findMany.mockResolvedValue([
      item,
      { ...item, id: 'word-2' },
    ]);
    const result = await service.list('owner', { limit: 1 });
    expect(prisma.vocabularyItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner' }, take: 2 }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('word-1');
    expect(result.items[0].savedAt).toBe(1_000);
  });
  it('does not accept a cursor belonging to another account', async () => {
    const { prisma, service } = setup();
    await expect(
      service.list('owner', { limit: 100, cursor: 'foreign-id' }),
    ).rejects.toThrow('Không tìm thấy');
    expect(prisma.vocabularyItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign-id', userId: 'owner' } }),
    );
    expect(prisma.vocabularyItem.findMany).not.toHaveBeenCalled();
  });
  it('upserts by account and normalized term, preserving an example when absent', async () => {
    const { prisma, service } = setup();
    await service.save('owner', {
      term: '  Get   off WORK ',
      meaningVi: 'tan làm',
    });
    const input = prisma.vocabularyItem.upsert.mock.calls[0][0];
    expect(input.where).toEqual({
      userId_termKey: { userId: 'owner', termKey: 'get off work' },
    });
    expect(input.update.pinned).toBe(true);
    expect(input.update).not.toHaveProperty('example');
  });
  it('imports idempotently without overwriting newer server meanings', async () => {
    const { prisma, service } = setup();
    await service.import('owner', [
      { term: 'Commute', meaningVi: 'old' },
      { term: ' commute ', meaningVi: 'old' },
    ]);
    expect(prisma.vocabularyItem.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.vocabularyItem.upsert.mock.calls[0][0].update).toEqual({
      pinned: true,
    });
  });
  it('delete always includes the authenticated user filter', async () => {
    const { prisma, service } = setup();
    await service.remove('owner', 'foreign-id');
    expect(prisma.vocabularyItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner', id: 'foreign-id' },
    });
  });
  it('rejects caller-supplied user IDs and bounds import size', () => {
    expect(
      vocabularyWordSchema.safeParse({
        term: 'hello',
        meaningVi: 'xin chào',
        userId: 'other',
      }).success,
    ).toBe(false);
    expect(
      vocabularyImportSchema.safeParse({
        words: Array(101).fill({ term: 'hello', meaningVi: 'xin chào' }),
      }).success,
    ).toBe(false);
  });
});

describe('vocabulary decks', () => {
  it('lists only the owner’s decks with word counts', async () => {
    const { prisma, service } = setup();
    prisma.vocabularyDeck.findMany.mockResolvedValue([
      {
        id: 'deck',
        name: 'Work',
        createdAt: new Date(1),
        updatedAt: new Date(2),
        _count: { words: 3 },
      },
    ]);
    const result = await service.listDecks('owner');
    expect(result.items[0].wordCount).toBe(3);
    expect(prisma.vocabularyDeck.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner' } }),
    );
  });
  it('normalizes deck names and reports duplicate names', async () => {
    const { prisma, service } = setup();
    await service.createDeck('owner', '  Công   việc  ');
    expect(prisma.vocabularyDeck.create).toHaveBeenCalledWith({
      data: { userId: 'owner', name: 'Công việc', nameKey: 'công việc' },
    });
    prisma.vocabularyDeck.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createDeck('owner', 'Công việc')).rejects.toThrow(
      'mang tên này',
    );
  });
  it('rename and delete always filter by owner; deleting a deck never deletes its words', async () => {
    const { prisma, service } = setup();
    await service.renameDeck('owner', 'deck', 'Travel');
    expect(prisma.vocabularyDeck.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'owner', id: 'deck' } }),
    );
    prisma.vocabularyDeck.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.renameDeck('owner', 'foreign', 'Travel'),
    ).rejects.toThrow('Không tìm thấy');
    await service.deleteDeck('owner', 'foreign');
    expect(prisma.vocabularyDeck.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'owner', id: 'foreign' },
    });
    expect(prisma.vocabularyItem.deleteMany).not.toHaveBeenCalled();
  });
  it('automatic saves preserve existing membership and explicit saves can clear or set it', async () => {
    const { prisma, service } = setup();
    await service.save('owner', { term: 'hello', meaningVi: 'chào' });
    expect(
      prisma.vocabularyItem.upsert.mock.calls[0][0].update,
    ).not.toHaveProperty('deckId');
    await service.save('owner', {
      term: 'hello',
      meaningVi: 'chào',
      deckId: null,
    });
    expect(
      prisma.vocabularyItem.upsert.mock.calls[1][0].update.deckId,
    ).toBeNull();
    prisma.vocabularyDeck.findFirst.mockResolvedValueOnce({ id: 'deck' });
    await service.save('owner', {
      term: 'hello',
      meaningVi: 'chào',
      deckId: 'deck',
    });
    expect(prisma.vocabularyItem.upsert.mock.calls[2][0].update.deckId).toBe(
      'deck',
    );
    await expect(
      service.save('owner', {
        term: 'hello',
        meaningVi: 'chào',
        deckId: 'foreign',
      }),
    ).rejects.toThrow('Không tìm thấy bộ');
    expect(prisma.vocabularyItem.upsert).toHaveBeenCalledTimes(3);
  });
  it('moves selected owned words atomically, de-duplicates IDs, and pins them against reanalysis', async () => {
    const { prisma, service } = setup();
    prisma.vocabularyDeck.findFirst.mockResolvedValueOnce({ id: 'deck' });
    expect(
      await service.assign('owner', {
        deckId: 'deck',
        wordIds: ['a', 'b', 'a'],
      }),
    ).toEqual({ moved: 2 });
    expect(prisma.vocabularyItem.updateMany).toHaveBeenCalledWith({
      where: { userId: 'owner', id: { in: ['a', 'b'] } },
      data: { deckId: 'deck', pinned: true },
    });
  });
  it('rejects foreign decks or any foreign/missing word without partial assignment', async () => {
    const { prisma, service } = setup();
    await expect(
      service.assign('owner', { deckId: 'foreign', wordIds: ['a', 'b'] }),
    ).rejects.toThrow('Không tìm thấy bộ');
    prisma.vocabularyItem.count.mockResolvedValueOnce(1);
    await expect(
      service.assign('owner', { deckId: null, wordIds: ['a', 'foreign'] }),
    ).rejects.toThrow('Không tìm thấy từ');
    expect(prisma.vocabularyItem.updateMany).not.toHaveBeenCalled();
  });
  it('validates names, batch limits and caller-supplied ownership', () => {
    expect(vocabularyDeckSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      vocabularyDeckSchema.safeParse({ name: 'Work', userId: 'other' }).success,
    ).toBe(false);
    expect(
      vocabularyAssignmentSchema.safeParse({ wordIds: [], deckId: null })
        .success,
    ).toBe(false);
    expect(
      vocabularyAssignmentSchema.safeParse({
        wordIds: Array(101).fill('00000000-0000-4000-8000-000000000001'),
        deckId: null,
      }).success,
    ).toBe(false);
  });
});
