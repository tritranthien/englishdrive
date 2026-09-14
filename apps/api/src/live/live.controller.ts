import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createLiveTokenSchema,
  type CreateLiveTokenInput,
} from './live.schemas.js';
import { LiveService } from './live.service.js';

@Controller('live')
@UseGuards(AuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Post('token')
  createToken(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createLiveTokenSchema))
    input: CreateLiveTokenInput,
  ) {
    return this.liveService.createGeminiToken(
      request.user.id,
      input.sessionId,
      input.conversationMode,
    );
  }
}
