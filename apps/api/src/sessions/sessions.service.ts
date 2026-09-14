import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SessionAnalysisService } from '../analysis/session-analysis.service.js';
import type {
  AppendTranscriptInput,
  CompleteSessionInput,
  CreateSessionInput,
} from './sessions.schemas.js';
import { SessionsRepository } from './sessions.repository.js';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionAnalysis: SessionAnalysisService,
  ) {}

  create(userId: string, input: CreateSessionInput) {
    return this.sessionsRepository.create(userId, input);
  }

  findAll(userId: string) {
    return this.sessionsRepository.findAllForUser(userId);
  }

  async findOne(userId: string, id: string) {
    const session = await this.sessionsRepository.findDetailsForUser(
      id,
      userId,
    );

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  async complete(
    userId: string,
    id: string,
    input: CompleteSessionInput = { messages: [] },
  ) {
    const session = await this.findOwned(userId, id);

    if (session.status === 'COMPLETED') {
      if (input.messages.length > 0) {
        const stored = await this.sessionsRepository.appendTranscript(
          id,
          input.messages,
        );
        if (stored.count > 0) await this.sessionAnalysis.reschedule(id);
        return this.findOne(userId, id);
      }
      await this.sessionAnalysis.schedule(id);
      return session;
    }

    if (session.status !== 'ACTIVE') {
      throw new ConflictException('Only an active session can be completed');
    }

    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );

    const completed = await this.sessionsRepository.complete(
      id,
      endedAt,
      durationSeconds,
      input.messages,
    );
    await this.sessionAnalysis.schedule(id);
    return completed;
  }

  async appendTranscript(
    userId: string,
    id: string,
    input: AppendTranscriptInput,
  ) {
    await this.requireActive(userId, id);
    const result = await this.sessionsRepository.appendTranscript(
      id,
      input.messages,
    );
    return { accepted: input.messages.length, stored: result.count };
  }

  async setProvider(
    userId: string,
    id: string,
    provider: string,
    model: string,
  ) {
    await this.requireActive(userId, id);
    return this.sessionsRepository.setProvider(id, provider, model);
  }

  async requireActive(userId: string, id: string) {
    const session = await this.findOwned(userId, id);

    if (session.status !== 'ACTIVE') {
      throw new ConflictException('Realtime requires an active session');
    }

    return session;
  }

  private async findOwned(userId: string, id: string) {
    const session = await this.sessionsRepository.findForUser(id, userId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }
}
