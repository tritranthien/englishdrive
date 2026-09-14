import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { LearningContextService } from './learning-context.service.js';

@Controller('learning/context')
@UseGuards(AuthGuard)
export class LearningContextController {
  constructor(private readonly learningContext: LearningContextService) {}

  @Get()
  build(@Req() request: AuthenticatedRequest) {
    return this.learningContext.build(request.user.id);
  }
}
