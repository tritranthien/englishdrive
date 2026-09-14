import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  updateLearningProfileSchema,
  type UpdateLearningProfileInput,
} from './learning-profile.schemas.js';
import { LearningProfileService } from './learning-profile.service.js';

@Controller('learning/profile')
@UseGuards(AuthGuard)
export class LearningProfileController {
  constructor(
    private readonly learningProfileService: LearningProfileService,
  ) {}

  @Get()
  find(@Req() request: AuthenticatedRequest) {
    return this.learningProfileService.findForUser(request.user.id);
  }

  @Patch()
  update(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(updateLearningProfileSchema))
    input: UpdateLearningProfileInput,
  ) {
    return this.learningProfileService.updateForUser(request.user.id, input);
  }
}
