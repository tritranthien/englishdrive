import { ApiKeysService } from './api-keys.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('ApiKeysService', () => {
  let rows: Map<
    string,
    { provider: string; encryptedValue: string; updatedAt: Date }
  >;
  let prisma: PrismaService;
  beforeEach(() => {
    vi.stubEnv('API_KEYS_ENCRYPTION_KEY', 'ab'.repeat(32));
    vi.stubEnv('GEMINI_API_KEY', 'environment-gemini-key');
    vi.stubEnv('OPENAI_API_KEY', '');
    rows = new Map();
    prisma = {
      apiKeySetting: {
        findMany: vi.fn(async () => [...rows.values()]),
        upsert: vi.fn(async ({ create, update, where }) => {
          const row = {
            provider: where.provider,
            ...create,
            ...update,
            updatedAt: new Date(),
          };
          rows.set(where.provider, row);
          return row;
        }),
        deleteMany: vi.fn(async ({ where }) => {
          rows.delete(where.provider);
          return { count: 1 };
        }),
      },
    } as unknown as PrismaService;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('encrypts keys, returns metadata only, and loads overrides after restart', async () => {
    const service = new ApiKeysService(prisma);
    const key = 'new-provider-key-not-to-be-disclosed';
    const status = await service.save('gemini', key);
    expect(process.env.GEMINI_API_KEY).toBe(key);
    expect(rows.get('gemini')?.encryptedValue).not.toContain(key);
    expect(JSON.stringify(status)).not.toContain(key);
    expect(status.providers[0]).toMatchObject({
      configured: true,
      source: 'dashboard',
    });
    vi.stubEnv('GEMINI_API_KEY', 'environment-gemini-key');
    const restarted = new ApiKeysService(prisma);
    await restarted.load();
    expect(process.env.GEMINI_API_KEY).toBe(key);
    await restarted.reset('gemini');
    expect(process.env.GEMINI_API_KEY).toBe('environment-gemini-key');
    expect(rows.size).toBe(0);
  });

  it('does not change the running key when database writes fail', async () => {
    vi.mocked(prisma.apiKeySetting.upsert).mockRejectedValueOnce(
      new Error('Database unavailable'),
    );
    const service = new ApiKeysService(prisma);
    await expect(service.save('gemini', 'replacement-key')).rejects.toThrow();
    expect(process.env.GEMINI_API_KEY).toBe('environment-gemini-key');
    await service.save('gemini', 'second-replacement-key');
    expect(process.env.GEMINI_API_KEY).toBe('second-replacement-key');
  });

  it('rejects a changed encryption key or moving ciphertext to another provider', async () => {
    const service = new ApiKeysService(prisma);
    await service.save('gemini', 'secret-replacement-key');
    vi.stubEnv('API_KEYS_ENCRYPTION_KEY', 'cd'.repeat(32));
    await expect(new ApiKeysService(prisma).load()).rejects.toThrow(
      'Không thể giải mã',
    );
    vi.stubEnv('API_KEYS_ENCRYPTION_KEY', 'ab'.repeat(32));
    const row = rows.get('gemini')!;
    rows.clear();
    rows.set('openai', { ...row, provider: 'openai' });
    await expect(new ApiKeysService(prisma).load()).rejects.toThrow(
      'Không thể giải mã',
    );
  });

  it('keeps environment configuration usable without an encryption key but disables saving', async () => {
    vi.stubEnv('API_KEYS_ENCRYPTION_KEY', '');
    const service = new ApiKeysService(prisma);
    await service.load();
    expect(service.status().writable).toBe(false);
    await expect(service.save('gemini', 'replacement')).rejects.toThrow(
      'khóa mã hóa',
    );
    expect(process.env.GEMINI_API_KEY).toBe('environment-gemini-key');
  });

  it('resets a provider without an environment fallback to unconfigured', async () => {
    const service = new ApiKeysService(prisma);
    await service.save('openai', 'replacement-openai-key');
    await service.reset('openai');
    expect(process.env.OPENAI_API_KEY).toBe('');
    expect(service.status().providers[1].configured).toBe(false);
  });

  it('uses the active provider key and never returns provider error bodies', async () => {
    const service = new ApiKeysService(prisma);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('sensitive-provider-body', { status: 403 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.test('gemini');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      'x-goog-api-key': 'environment-gemini-key',
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('403');
    expect(result.message).not.toContain('sensitive-provider-body');
    fetchMock.mockRejectedValueOnce(new Error('network error with secret'));
    expect((await service.test('gemini')).message).not.toContain('secret');
  });
});
