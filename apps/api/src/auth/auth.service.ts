import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { parseEnvironment } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import type { AuthenticatedUser } from './auth.types.js';

@Injectable()
export class AuthService {
  private readonly jwtSecret: Uint8Array;
  private readonly jwtExpiresIn: string;

  constructor(private readonly prisma: PrismaService) {
    const env = parseEnvironment(process.env);
    this.jwtSecret = new TextEncoder().encode(env.JWT_SECRET);
    this.jwtExpiresIn = env.JWT_EXPIRES_IN;
  }

  async register(input: RegisterInput) {
    const passwordHash = await hash(input.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash,
          profile: { create: {} },
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          profile: true,
        },
      });

      return {
        user,
        ...(await this.createAccessToken({ id: user.id, email: user.email })),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }

      throw error;
    }
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      ...(await this.createAccessToken({ id: user.id, email: user.email })),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        issuer: 'english-drive-api',
        audience: 'english-drive-mobile',
      });

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string'
      ) {
        throw new UnauthorizedException('Invalid access token');
      }

      return { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private async createAccessToken(user: AuthenticatedUser) {
    const accessToken = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer('english-drive-api')
      .setAudience('english-drive-mobile')
      .setIssuedAt()
      .setExpirationTime(this.jwtExpiresIn)
      .sign(this.jwtSecret);

    return { accessToken, tokenType: 'Bearer', expiresIn: this.jwtExpiresIn };
  }
}
