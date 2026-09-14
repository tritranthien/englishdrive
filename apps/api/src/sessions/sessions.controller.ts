import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  appendTranscriptSchema,
  completeSessionSchema,
  createSessionSchema,
  type AppendTranscriptInput,
  type CompleteSessionInput,
  type CreateSessionInput,
} from './sessions.schemas.js';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
@UseGuards(AuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createSessionSchema)) input: CreateSessionInput,
  ) {
    return this.sessionsService.create(request.user.id, input);
  }

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.sessionsService.findAll(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sessionsService.findOne(request.user.id, id);
  }

  @Post(':id/complete')
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeSessionSchema))
    input: CompleteSessionInput,
  ) {
    return this.sessionsService.complete(request.user.id, id, input);
  }

  @Post(':id/transcript')
  appendTranscript(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(appendTranscriptSchema))
    input: AppendTranscriptInput,
  ) {
    return this.sessionsService.appendTranscript(request.user.id, id, input);
  }
}
