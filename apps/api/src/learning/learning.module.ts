import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LearningContextController } from './learning-context.controller.js';
import { LearningContextService } from './learning-context.service.js';
import { LearningMemoryService } from './learning-memory.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LearningContextController],
  providers: [LearningContextService, LearningMemoryService],
  exports: [LearningContextService, LearningMemoryService],
})
export class LearningModule {}
