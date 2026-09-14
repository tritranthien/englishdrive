import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SessionAnalysisController } from './session-analysis.controller.js';
import { SessionAnalysisService } from './session-analysis.service.js';

@Module({
  imports: [AuthModule, PrismaModule, LearningModule],
  controllers: [SessionAnalysisController],
  providers: [SessionAnalysisService],
  exports: [SessionAnalysisService],
})
export class AnalysisModule {}
