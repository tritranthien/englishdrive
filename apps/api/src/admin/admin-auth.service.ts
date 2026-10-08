import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcryptjs';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Request } from 'express';

@Injectable()
export class AdminAuthService implements CanActivate {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();

  private config() {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash)
      throw new ServiceUnavailableException('Dashboard chưa được cấu hình');
    return {
      hash,
      key: new TextEncoder().encode(process.env.JWT_SECRET!),
      version: createHash('sha256').update(hash).digest('hex'),
    };
  }

  async login(password: string, ip: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until <= now) this.attempts.delete(key);
    const attempt = this.attempts.get(ip) ?? {
      count: 0,
      until: now + 15 * 60_000,
    };
    if (attempt.count >= 5 || this.attempts.size >= 10_000) {
      throw new HttpException('Thử lại sau 15 phút', 429);
    }
    attempt.count++;
    this.attempts.set(ip, attempt);
    const config = this.config();
    if (!(await compare(password, config.hash)))
      throw new UnauthorizedException('Mật khẩu không đúng');
    this.attempts.delete(ip);
    return new SignJWT({ version: config.version })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin')
      .setIssuer('english-drive-api')
      .setAudience('english-drive-admin')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(config.key);
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      request.get('x-dashboard-request') !== '1'
    ) {
      throw new UnauthorizedException('Invalid dashboard request');
    }
    const cookie = request.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('ed_admin='));
    if (!cookie) throw new UnauthorizedException();
    const config = this.config();
    try {
      const { payload } = await jwtVerify(
        cookie.slice('ed_admin='.length),
        config.key,
        {
          issuer: 'english-drive-api',
          audience: 'english-drive-admin',
          algorithms: ['HS256'],
        },
      );
      if (payload.sub !== 'admin' || payload.version !== config.version)
        throw new Error();
      return true;
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn');
    }
  }
}
