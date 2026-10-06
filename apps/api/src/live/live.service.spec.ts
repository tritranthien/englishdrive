import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { LearningProfileService } from '../learning-profile/learning-profile.service.js';
import { TutorPolicyService } from '../tutor/tutor-policy.service.js';
import { LiveService } from './live.service.js';
import type { LearningContextService } from '../learning/learning-context.service.js';

describe('LiveService', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const sessionsService = {
    requireActive: vi.fn().mockResolvedValue({ id: 'session-id' }),
    setProvider: vi.fn().mockResolvedValue({ id: 'session-id' }),
  } as unknown as SessionsService;
  const learningProfileService = {
    findForUser: vi.fn().mockResolvedValue({
      level: 'B1',
      languageMode: 'INTERMEDIATE',
      englishRatio: 0.8,
      correctionMode: 'IMPORTANT_ONLY',
      conversationStyle: 'friendly',
    }),
  } as unknown as LearningProfileService;
  const tutorPolicyService = new TutorPolicyService();
  const learningContextService = {
    build: vi.fn().mockResolvedValue({
      currentFocus: ['past tense'],
      recurringMistakes: [],
      reviewVocabulary: [],
      recentTopics: ['work'],
      recentSessionSummaries: [],
    }),
    format: vi
      .fn()
      .mockReturnValue('Personal learning context. Current focus: past tense.'),
  } as unknown as LearningContextService;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('provisions a short-lived Gemini token for an owned active session', async () => {
    process.env.GEMINI_API_KEY = 'server-only-gemini-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'auth-token-value' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new LiveService(
      sessionsService,
      learningProfileService,
      tutorPolicyService,
      learningContextService,
    );

    await expect(
      service.createGeminiToken('user-id', 'session-id'),
    ).resolves.toMatchObject({
      provider: 'gemini',
      token: 'auth-token-value',
      model: 'gemini-3.1-flash-live-preview',
      tutor: { conversationMode: 'FREE_CONVERSATION' },
      sessionConfig: {
        systemInstruction: expect.stringContaining(
          'friendly English conversation partner and tutor',
        ),
        tools: [
          {
            functionDeclarations: [
              expect.objectContaining({ name: 'show_vocabulary' }),
            ],
          },
        ],
      },
      learningContext: { currentFocus: ['past tense'] },
    });
    expect(sessionsService.requireActive).toHaveBeenCalledWith(
      'user-id',
      'session-id',
    );
    expect(sessionsService.setProvider).toHaveBeenCalledWith(
      'user-id',
      'session-id',
      'gemini',
      'gemini-3.1-flash-live-preview',
    );
    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
    );
    expect(request[1].headers).toMatchObject({
      'x-goog-api-key': 'server-only-gemini-key',
    });
    expect(JSON.parse(request[1].body as string)).toMatchObject({
      uses: 1,
    });
    expect(JSON.parse(request[1].body as string)).not.toHaveProperty(
      'bidiGenerateContentSetup',
    );
  });

  it('fails clearly when the Gemini server key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    const service = new LiveService(
      sessionsService,
      learningProfileService,
      tutorPolicyService,
      learningContextService,
    );

    await expect(
      service.createGeminiToken('user-id', 'session-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects malformed provider responses before returning them to mobile', async () => {
    process.env.GEMINI_API_KEY = 'server-only-gemini-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const service = new LiveService(
      sessionsService,
      learningProfileService,
      tutorPolicyService,
      learningContextService,
    );

    await expect(
      service.createGeminiToken('user-id', 'session-id'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
