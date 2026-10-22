import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VideosAiService } from './videos-ai.service.js';
import { VideosController } from './videos.controller.js';
import { VideosService } from './videos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [VideosController],
  providers: [VideosService, VideosAiService],
  exports: [VideosService],
})
export class VideosModule {}
