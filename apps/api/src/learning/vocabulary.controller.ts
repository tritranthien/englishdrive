import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  vocabularyDeckSchema,
  vocabularyAssignmentSchema,
  type VocabularyAssignmentInput,
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

  @Get('decks')
  decks(@Req() request: AuthenticatedRequest) {
    return this.vocabulary.listDecks(request.user.id);
  }
  @Post('decks')
  createDeck(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(vocabularyDeckSchema)) input: { name: string },
  ) {
    return this.vocabulary.createDeck(request.user.id, input.name);
  }
  @Patch('decks/:id')
  renameDeck(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(vocabularyDeckSchema)) input: { name: string },
  ) {
    return this.vocabulary.renameDeck(request.user.id, id, input.name);
  }
  @Delete('decks/:id')
  deleteDeck(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.vocabulary.deleteDeck(request.user.id, id);
  }
  @Patch('assignment')
  assign(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(vocabularyAssignmentSchema))
    input: VocabularyAssignmentInput,
  ) {
    return this.vocabulary.assign(request.user.id, input);
  }
}
