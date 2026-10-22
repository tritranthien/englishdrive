import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  createVideoSchema,
  videoVocabularySelectionSchema,
} from './videos.schemas.js';
import { VideosService } from './videos.service.js';

@Controller('videos')
@UseGuards(AuthGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.videos.list(req.user.id);
  }

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createVideoSchema))
    body: z.infer<typeof createVideoSchema>,
  ) {
    return this.videos.create(req.user.id, body.url);
  }

  @Get(':id')
  get(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.videos.get(req.user.id, id);
  }

  @Post(':id/retry')
  retry(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.videos.retry(req.user.id, id);
  }

  @Delete(':id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.videos.remove(req.user.id, id);
  }

  @Post(':id/vocabulary')
  lookupVocabulary(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(videoVocabularySelectionSchema))
    body: z.infer<typeof videoVocabularySelectionSchema>,
  ) {
    return this.videos.lookupVocabulary(
      req.user.id,
      id,
      body.cueId,
      body.start,
      body.end,
    );
  }
}
