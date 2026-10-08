import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminService } from './admin.service.js';

const loginSchema = z.object({ password: z.string().min(1).max(128) });
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  search: z.string().trim().max(200).default(''),
  status: z.enum(['', 'ACTIVE', 'COMPLETED', 'FAILED']).default(''),
});
export type AdminQuery = z.infer<typeof querySchema>;
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.ADMIN_COOKIE_SECURE === 'true',
  path: '/admin',
});

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly service: AdminService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page() {
    return readFileSync(
      new URL('./public/index.html', import.meta.url),
      'utf8',
    );
  }

  @Get('app.js')
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  script() {
    return readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
  }

  @Get('style.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  style() {
    return readFileSync(new URL('./public/style.css', import.meta.url), 'utf8');
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema))
    input: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(input.password, req.ip ?? 'unknown');
    res.cookie('ed_admin', token, {
      ...cookieOptions(),
      maxAge: 8 * 60 * 60_000,
    });
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AdminAuthService)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('ed_admin', cookieOptions());
    return { ok: true };
  }

  @Get('api/overview')
  @UseGuards(AdminAuthService)
  overview() {
    return this.service.overview();
  }

  @Get('api/users')
  @UseGuards(AdminAuthService)
  users(@Query(new ZodValidationPipe(querySchema)) query: AdminQuery) {
    return this.service.users(query);
  }

  @Get('api/sessions')
  @UseGuards(AdminAuthService)
  sessions(@Query(new ZodValidationPipe(querySchema)) query: AdminQuery) {
    return this.service.sessions(query);
  }

  @Get('api/sessions/:id')
  @UseGuards(AdminAuthService)
  session(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.session(id);
  }
}
