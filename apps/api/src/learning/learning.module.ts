import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LearningContextController } from './learning-context.controller.js';
import { LearningContextService } from './learning-context.service.js';
import { LearningMemoryService } from './learning-memory.service.js';
import { VocabularyController } from './vocabulary.controller.js';
import { VocabularyService } from './vocabulary.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LearningContextController, VocabularyController],
  providers: [LearningContextService, LearningMemoryService, VocabularyService],
  exports: [LearningContextService, LearningMemoryService],
})
export class LearningModule {}
