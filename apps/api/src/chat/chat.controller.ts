import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ChatService } from './chat.service.js';
import { ChatPushService } from './chat-push.service.js';
import {
  characterSchema,
  deviceSchema,
  helpSchema,
  pageSchema,
  preferencesSchema,
  sendSchema,
  threadPatchSchema,
  threadSchema,
} from './chat.schemas.js';

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly push: ChatPushService,
  ) {}
  @Get('status') status() {
    return {
      pushConfigured: this.push.configured,
      proactiveEnabled: process.env.CHAT_PROACTIVE_ENABLED === 'true',
    };
  }
  @Get('catalog') catalog() {
    return this.chat.catalog();
  }
  @Get('characters') characters(@Req() r: AuthenticatedRequest) {
    return this.chat.characters(r.user.id);
  }
  @Post('characters') addCharacter(
    @Req() r: AuthenticatedRequest,
    @Body(
      new ZodValidationPipe(
        z.union([
          characterSchema,
          z.object({ templateId: z.string().min(1).max(60) }),
        ]),
      ),
    )
    body: z.infer<typeof characterSchema> | { templateId: string },
  ) {
    return this.chat.addCharacter(r.user.id, body);
  }
  @Patch('characters/:id') editCharacter(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(characterSchema))
    body: z.infer<typeof characterSchema>,
  ) {
    return this.chat.editCharacter(r.user.id, id, body);
  }
  @Get('preferences') preferences(@Req() r: AuthenticatedRequest) {
    return this.chat.preferences(r.user.id);
  }
  @Patch('preferences') savePreferences(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodValidationPipe(preferencesSchema))
    body: z.infer<typeof preferencesSchema>,
  ) {
    return this.chat.savePreferences(r.user.id, body);
  }
  @Get('threads') threads(@Req() r: AuthenticatedRequest) {
    return this.chat.threads(r.user.id);
  }
  @Post('threads') createThread(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodValidationPipe(threadSchema))
    body: z.infer<typeof threadSchema>,
  ) {
    return this.chat.createThread(r.user.id, body);
  }
  @Get('threads/:id') thread(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.thread(r.user.id, id);
  }
  @Patch('threads/:id') updateThread(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(threadPatchSchema))
    body: z.infer<typeof threadPatchSchema>,
  ) {
    return this.chat.updateThread(r.user.id, id, body);
  }
  @Get('threads/:id/messages') messages(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.chat.messages(r.user.id, id, query.before, query.after);
  }
  @Post('threads/:id/messages') send(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendSchema)) body: z.infer<typeof sendSchema>,
  ) {
    return this.chat.send(r.user.id, id, body.clientMessageId, body.content);
  }
  @Post('threads/:id/read') read(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ZodValidationPipe(z.object({ sequence: z.number().int().min(0) })),
    )
    body: { sequence: number },
  ) {
    return this.chat.read(r.user.id, id, body.sequence);
  }
  @Post('threads/:id/retry') retry(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.retry(r.user.id, id);
  }
  @Post('threads/:id/help') help(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(helpSchema)) body: z.infer<typeof helpSchema>,
  ) {
    return this.chat.help(r.user.id, id, body.action, body.messageId);
  }
  @Post('devices') device(
    @Req() r: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceSchema))
    body: z.infer<typeof deviceSchema>,
  ) {
    return this.chat.registerDevice(r.user.id, body.token, body.installationId);
  }
  @Delete('devices/:id') removeDevice(
    @Req() r: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chat.unregisterDevice(r.user.id, id);
  }
}
