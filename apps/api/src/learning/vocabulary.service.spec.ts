import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { VocabularyService } from './vocabulary.service.js';
import {
  vocabularyImportSchema,
  vocabularyWordSchema,
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
  const prisma = {
    vocabularyItem: {
      findMany: vi.fn().mockResolvedValue([item]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(item),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
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
