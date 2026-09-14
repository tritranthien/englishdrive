import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LearningProfileController } from './learning-profile.controller.js';
import { LearningProfileService } from './learning-profile.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LearningProfileController],
  providers: [LearningProfileService],
  exports: [LearningProfileService],
})
export class LearningProfileModule {}
