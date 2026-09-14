import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createRealtimeSessionSchema,
  type CreateRealtimeSessionInput,
} from './realtime.schemas.js';
import { RealtimeService } from './realtime.service.js';

@Controller('realtime')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Post('session')
  createSession(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createRealtimeSessionSchema))
    input: CreateRealtimeSessionInput,
  ) {
    return this.realtimeService.createClientSecret(
      request.user.id,
      input.sessionId,
    );
  }
}
