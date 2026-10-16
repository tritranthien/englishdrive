import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatAiService } from './chat-ai.service.js';
import { ChatPushService } from './chat-push.service.js';
import { ChatWorkerService } from './chat-worker.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatAiService, ChatPushService, ChatWorkerService],
})
export class ChatModule {}
