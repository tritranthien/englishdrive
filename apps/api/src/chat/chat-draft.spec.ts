import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';
import type { ChatAiService } from './chat-ai.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { draftTranslationSchema } from './chat.schemas.js';

function setup() {
  const prisma = {
    chatJob: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn().mockResolvedValue({ id: 'job' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const ai = {
    generate: vi.fn().mockResolvedValue({
      replacements: [{ start: 15, end: 24, text: 'football' }],
    }),
  };
  const service = new ChatService(
    prisma as unknown as PrismaService,
    ai as unknown as ChatAiService,
  );
  const access = vi.spyOn(service, 'thread').mockResolvedValue({} as never);
  return { prisma, ai, service, access };
}
describe('draft translation', () => {
  it('preserves whitespace so UTF-16 replacement offsets stay valid', () => {
    const draft = '  😀 `bóng đá`  ';
    expect(draftTranslationSchema.parse({ draft }).draft).toBe(draft);
  });
  it('returns only replacements and never creates a message or reply', async () => {
    const { service, ai, prisma } = setup();
    expect(
      await service.translateDraft(
        'user',
        'thread',
        'i want to play `bóng đá`',
      ),
    ).toEqual({ replacements: [{ start: 15, end: 24, text: 'football' }] });
    expect(ai.generate).toHaveBeenCalledTimes(1);
    expect(prisma.chatJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DONE' }),
      }),
    );
  });
  it('checks ownership before returning a cached result', async () => {
    const { service, access, prisma, ai } = setup();
    access.mockRejectedValue(new Error('Không có quyền'));
    await expect(
      service.translateDraft('other', 'thread', '`bóng đá`'),
    ).rejects.toThrow('Không có quyền');
    expect(prisma.chatJob.findUnique).not.toHaveBeenCalled();
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('uses cache and skips incomplete markers', async () => {
    const { service, prisma, ai } = setup();
    expect(
      await service.translateDraft('user', 'thread', 'hello `word'),
    ).toEqual({ replacements: [] });
    prisma.chatJob.findUnique.mockResolvedValue({
      status: 'DONE',
      payload: { replacements: [{ start: 15, end: 24, text: 'football' }] },
    });
    await service.translateDraft('user', 'thread', 'i want to play `bóng đá`');
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('rejects shifted ranges and enforces the help quota', async () => {
    const { service, prisma, ai } = setup();
    ai.generate.mockResolvedValue({
      replacements: [{ start: 0, end: 24, text: 'football' }],
    });
    await expect(
      service.translateDraft('user', 'thread', 'i want to play `bóng đá`'),
    ).rejects.toThrow('không khớp');
    expect(prisma.chatJob.update).not.toHaveBeenCalled();
    prisma.chatJob.count.mockResolvedValue(60);
    await expect(
      service.translateDraft('user', 'thread', 'i want to play `bóng đá`'),
    ).rejects.toThrow('trợ giúp');
  });
});
