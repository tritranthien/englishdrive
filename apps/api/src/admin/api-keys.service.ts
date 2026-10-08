import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export type ApiKeyProvider = 'gemini' | 'openai';
const variables = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
} as const;

@Injectable()
export class ApiKeysService {
  private readonly fallback = {
    gemini: process.env.GEMINI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
  };
  private readonly updated = new Map<ApiKeyProvider, Date>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  private encryptionKey() {
    const key = process.env.API_KEYS_ENCRYPTION_KEY;
    if (!key || !/^[a-f\d]{64}$/i.test(key)) {
      throw new ServiceUnavailableException(
        'Server chưa cấu hình khóa mã hóa API key',
      );
    }
    return Buffer.from(key, 'hex');
  }

  private encrypt(provider: ApiKeyProvider, value: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), nonce);
    cipher.setAAD(Buffer.from(provider));
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      nonce.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  private decrypt(provider: ApiKeyProvider, value: string) {
    const key = this.encryptionKey();
    try {
      const [version, nonce, tag, data, extra] = value.split('.');
      if (version !== 'v1' || !nonce || !tag || !data || extra)
        throw new Error();
      const cipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(nonce, 'base64'),
      );
      cipher.setAAD(Buffer.from(provider));
      cipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        cipher.update(Buffer.from(data, 'base64')),
        cipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(
        'Không thể giải mã cấu hình API key. Kiểm tra API_KEYS_ENCRYPTION_KEY.',
      );
    }
  }

  // Called before app.listen(), so background analysis also starts with saved keys.
  async load() {
    const rows = await this.prisma.apiKeySetting.findMany();
    const decoded = rows
      .filter((row) => row.provider === 'gemini' || row.provider === 'openai')
      .map((row) => ({
        ...row,
        provider: row.provider as ApiKeyProvider,
        value: this.decrypt(row.provider as ApiKeyProvider, row.encryptedValue),
      }));
    for (const row of decoded) {
      process.env[variables[row.provider]] = row.value;
      this.updated.set(row.provider, row.updatedAt);
    }
  }

  status() {
    return {
      writable: /^[a-f\d]{64}$/i.test(
        process.env.API_KEYS_ENCRYPTION_KEY || '',
      ),
      providers: (['gemini', 'openai'] as const).map((provider) => ({
        provider,
        configured: Boolean(process.env[variables[provider]]),
        source: this.updated.has(provider) ? 'dashboard' : 'environment',
        fallbackConfigured: Boolean(this.fallback[provider]),
        updatedAt: this.updated.get(provider) ?? null,
      })),
    };
  }

  save(provider: ApiKeyProvider, key: string) {
    const operation = this.queue.then(async () => {
      const encryptedValue = this.encrypt(provider, key);
      const row = await this.prisma.apiKeySetting.upsert({
        where: { provider },
        create: { provider, encryptedValue },
        update: { encryptedValue },
      });
      process.env[variables[provider]] = key;
      this.updated.set(provider, row.updatedAt);
      return this.status();
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }

  reset(provider: ApiKeyProvider) {
    const operation = this.queue.then(async () => {
      await this.prisma.apiKeySetting.deleteMany({ where: { provider } });
      process.env[variables[provider]] = this.fallback[provider];
      this.updated.delete(provider);
      return this.status();
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }

  async test(provider: ApiKeyProvider) {
    const key = process.env[variables[provider]];
    if (!key) return { ok: false, message: 'Chưa có API key để kiểm tra' };
    try {
      const response = await fetch(
        provider === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'
          : 'https://api.openai.com/v1/models',
        {
          headers:
            provider === 'gemini'
              ? { 'x-goog-api-key': key }
              : { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
      await response.body?.cancel();
      return {
        ok: response.ok,
        message: response.ok
          ? 'Kết nối thành công. Key truy cập được danh sách mô hình.'
          : `Nhà cung cấp từ chối yêu cầu (HTTP ${response.status}). Kiểm tra key và quyền truy cập.`,
      };
    } catch {
      return {
        ok: false,
        message: 'Không kết nối được nhà cung cấp trong 15 giây. Hãy thử lại.',
      };
    }
  }
}
