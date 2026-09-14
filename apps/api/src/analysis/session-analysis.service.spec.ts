import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { LearningMemoryService } from '../learning/learning-memory.service.js';
import { SessionAnalysisService } from './session-analysis.service.js';

const validAnalysis = {
  summary: 'Người học đã nói về công việc.',
  mainTopics: ['work'],
  grammarIssues: [
    {
      pattern: 'past tense',
      original: 'Yesterday I go to work.',
      suggestion: 'Yesterday I went to work.',
      explanationVi: 'Dùng quá khứ đơn cho sự việc đã xảy ra.',
    },
  ],
  newVocabulary: [
    {
      term: 'deployment',
      meaningVi: 'triển khai',
      example: 'The deployment went well.',
    },
  ],
  strengths: [
    {
      example: 'I fixed the API.',
      reasonVi: 'Câu rõ ràng và đúng cấu trúc.',
    },
  ],
  recommendedTopics: ['Describe a production incident'],
  nextSessionFocus: ['past tense'],
};

function setup(
  transcript: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>,
) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const ingestInTransaction = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    sessionAnalysis: { updateMany },
  };
  const prisma = {
    sessionAnalysis: { updateMany },
    conversationSession: {
      findUnique: vi.fn().mockResolvedValue({ id: 'session-id', transcript }),
    },
    $transaction: vi.fn(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  const learningMemory = {
    ingestInTransaction,
  } as unknown as LearningMemoryService;
  return {
    service: new SessionAnalysisService(prisma, learningMemory),
    updateMany,
    ingestInTransaction,
    transaction,
  };
}

describe('SessionAnalysisService', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('validates structured Gemini output before persisting it', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify(validAnalysis) }] } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { service, updateMany, ingestInTransaction, transaction } = setup([
      { role: 'USER', content: 'Yesterday I go to work.' },
      { role: 'ASSISTANT', content: 'What happened there?' },
    ]);

    await service.processPending('session-id');

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toContain('gemini-3.1-flash-lite:generateContent');
    expect(JSON.parse(request[1].body as string)).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
      },
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { sessionId: 'session-id', status: 'PROCESSING' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          summary: validAnalysis.summary,
          grammarIssues: validAnalysis.grammarIssues,
        }),
      }),
    );
    expect(ingestInTransaction).toHaveBeenCalledWith(
      transaction,
      'session-id',
      validAnalysis,
    );
  });

  it('marks analysis as failed when model output violates the schema', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"summary":42}' }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const { service, updateMany } = setup([
      { role: 'USER', content: 'A transcript.' },
    ]);

    await service.processPending('session-id');

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Gemini analysis did not match the required schema',
        }),
      }),
    );
  });

  it('creates an empty report without calling Gemini for an empty transcript', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { service, updateMany } = setup([]);

    await service.processPending('session-id');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          grammarIssues: [],
          newVocabulary: [],
        }),
      }),
    );
  });
});
