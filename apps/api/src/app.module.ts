import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LearningProfileModule } from './learning-profile/learning-profile.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { LiveModule } from './live/live.module.js';
import { AnalysisModule } from './analysis/analysis.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    LearningProfileModule,
    SessionsModule,
    RealtimeModule,
    LiveModule,
    AnalysisModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
