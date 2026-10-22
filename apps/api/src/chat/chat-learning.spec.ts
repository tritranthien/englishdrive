import { describe, expect, it, vi } from 'vitest';
import { ChatAiService } from './chat-ai.service.js';
import { ChatService } from './chat.service.js';
import { preferencesSchema } from './chat.schemas.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('chat learning support', () => {
  it('uses correction instructions by default and respects the off setting', async () => {
    const ai = new ChatAiService();
    const generate = vi
      .spyOn(ai, 'generate')
      .mockResolvedValue({ messages: [] });
    const context = {
      kind: 'DIRECT',
      romance: false,
      members: [{ id: 'friend' }],
    };
    await ai.reply(context);
    expect(generate.mock.calls[0][0]).toContain(
      'gently offer a corrected sentence',
    );
    await ai.reply({ ...context, autoCorrect: false });
    expect(generate.mock.calls[1][0]).toContain('Do not volunteer');
    expect(generate.mock.calls[1][0]).not.toContain(
      'gently offer a corrected sentence',
    );
  });

  it('accepts an explicit off value and leaves omitted settings untouched for older clients', () => {
    const prefs = {
      enabled: true,
      minMinutes: 120,
      maxMinutes: 360,
      dailyLimit: 6,
      quietStart: 22,
      quietEnd: 8,
      timezone: 'UTC',
    };
    expect(
      preferencesSchema.parse({ ...prefs, autoCorrect: false }).autoCorrect,
    ).toBe(false);
    expect(preferencesSchema.parse(prefs).autoCorrect).toBeUndefined();
    expect(
      preferencesSchema.safeParse({ ...prefs, autoCorrect: 'false' }).success,
    ).toBe(false);
  });

  it('explains the full message and returns vocabulary for individual saving', async () => {
    const message = {
      id: 'message',
      content: 'Would you like to play football today?',
    };
    const result = {
      text: 'Lời mời lịch sự.',
      vocabulary: [
        {
          term: 'would you like',
          meaningVi: 'bạn có muốn',
          example: 'Would you like some tea?',
        },
      ],
    };
    const prisma = {
      chatMessage: { findFirst: vi.fn().mockResolvedValue(message) },
      chatJob: {
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
        upsert: vi.fn().mockResolvedValue({ id: 'job' }),
        update: vi.fn(),
      },
    };
    const ai = { generate: vi.fn().mockResolvedValue(result) };
    const service = new ChatService(
      prisma as unknown as PrismaService,
      ai as unknown as ChatAiService,
    );
    vi.spyOn(service, 'thread').mockResolvedValue({} as never);
    expect(await service.help('user', 'thread', 'explain', 'message')).toEqual(
      result,
    );
    expect(ai.generate.mock.calls[0][1]).toEqual(message);
    expect(prisma.chatJob.findUnique).toHaveBeenCalledWith({
      where: { key: 'help:v2:thread:explain:message' },
    });
  });
});
