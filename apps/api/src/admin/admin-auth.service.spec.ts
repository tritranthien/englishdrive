import { hash } from 'bcryptjs';
import { SignJWT } from 'jose';
import type { ExecutionContext } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service.js';

function context(cookie?: string, method = 'GET', header?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { cookie }, method, get: () => header }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthService', () => {
  let auth: AdminAuthService;
  beforeEach(async () => {
    vi.stubEnv(
      'JWT_SECRET',
      'admin-test-secret-at-least-thirty-two-characters',
    );
    vi.stubEnv('ADMIN_PASSWORD_HASH', await hash('test-admin-password', 4));
    auth = new AdminAuthService();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires admin login and rejects missing/invalid cookies', async () => {
    await expect(auth.canActivate(context())).rejects.toThrow();
    await expect(
      auth.canActivate(context('ed_admin=invalid')),
    ).rejects.toThrow();
    await expect(auth.login('wrong', 'test')).rejects.toThrow(
      'Mật khẩu không đúng',
    );
    const token = await auth.login('test-admin-password', 'test');
    await expect(auth.canActivate(context('ed_admin=' + token))).resolves.toBe(
      true,
    );
  });

  it('rejects mobile tokens even with the same signing secret', async () => {
    const token = await new SignJWT({ email: 'user@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin')
      .setIssuer('english-drive-api')
      .setAudience('english-drive-mobile')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    await expect(
      auth.canActivate(context('ed_admin=' + token)),
    ).rejects.toThrow();
  });

  it('invalidates sessions after a password reset and protects mutations', async () => {
    const token = await auth.login('test-admin-password', 'test');
    await expect(
      auth.canActivate(context('ed_admin=' + token, 'POST')),
    ).rejects.toThrow();
    await expect(
      auth.canActivate(context('ed_admin=' + token, 'POST', '1')),
    ).resolves.toBe(true);
    vi.stubEnv('ADMIN_PASSWORD_HASH', await hash('new-password', 4));
    await expect(
      auth.canActivate(context('ed_admin=' + token)),
    ).rejects.toThrow();
  });

  it('limits incorrect attempts and allows retry after the cooldown', async () => {
    for (let i = 0; i < 5; i++)
      await expect(auth.login('wrong', 'test')).rejects.toThrow(
        'Mật khẩu không đúng',
      );
    await expect(auth.login('test-admin-password', 'test')).rejects.toThrow(
      'Thử lại sau 15 phút',
    );
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
    try {
      await expect(
        auth.login('test-admin-password', 'test'),
      ).resolves.toBeTypeOf('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('stays disabled when no admin password is configured', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', '');
    await expect(auth.login('anything', 'test')).rejects.toThrow(
      'Dashboard chưa được cấu hình',
    );
  });
});
