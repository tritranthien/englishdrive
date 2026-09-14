import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { LearningProfileModule } from '../learning-profile/learning-profile.module.js';
import { TutorModule } from '../tutor/tutor.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

@Module({
  imports: [
    AuthModule,
    SessionsModule,
    LearningProfileModule,
    TutorModule,
    LearningModule,
  ],
  controllers: [LiveController],
  providers: [LiveService],
})
export class LiveModule {}
