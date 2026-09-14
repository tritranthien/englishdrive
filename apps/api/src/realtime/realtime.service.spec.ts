import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionsService } from '../sessions/sessions.service.js';
import { RealtimeService } from './realtime.service.js';

describe('RealtimeService', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const sessionsService = {
    requireActive: vi.fn().mockResolvedValue({ id: 'session-id' }),
  } as unknown as SessionsService;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('returns a short-lived client secret for an owned active session', async () => {
    process.env.OPENAI_API_KEY = 'server-only-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: 'ek_test',
          expires_at: 123456,
          session: { id: 'sess_test', model: 'gpt-realtime-2.1' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new RealtimeService(sessionsService);

    await expect(
      service.createClientSecret('user-id', 'session-id'),
    ).resolves.toMatchObject({
      clientSecret: 'ek_test',
      realtimeSessionId: 'sess_test',
      model: 'gpt-realtime-2.1',
    });
    expect(sessionsService.requireActive).toHaveBeenCalledWith(
      'user-id',
      'session-id',
    );

    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toBe(
      'https://api.openai.com/v1/realtime/client_secrets',
    );
    expect(request[1].headers).toMatchObject({
      Authorization: 'Bearer server-only-key',
    });
  });

  it('fails clearly when the server API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new RealtimeService(sessionsService);

    await expect(
      service.createClientSecret('user-id', 'session-id'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
