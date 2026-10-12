import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  vocabularyImportSchema,
  vocabularyListSchema,
  vocabularyWordSchema,
  type VocabularyListInput,
  type VocabularyWordInput,
} from './vocabulary.schemas.js';
import { VocabularyService } from './vocabulary.service.js';

@Controller('vocabulary')
@UseGuards(AuthGuard)
export class VocabularyController {
  constructor(private readonly vocabulary: VocabularyService) {}
  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query(new ZodValidationPipe(vocabularyListSchema))
    query: VocabularyListInput,
  ) {
    return this.vocabulary.list(request.user.id, query);
  }
  @Post()
  save(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(vocabularyWordSchema))
    word: VocabularyWordInput,
  ) {
    return this.vocabulary.save(request.user.id, word);
  }
  @Post('import')
  import(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(vocabularyImportSchema))
    input: { words: VocabularyWordInput[] },
  ) {
    return this.vocabulary.import(request.user.id, input.words);
  }
  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.vocabulary.remove(request.user.id, id);
  }
}
