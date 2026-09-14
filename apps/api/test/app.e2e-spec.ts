import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SessionAnalysisService } from '../src/analysis/session-analysis.service.js';
import { LearningMemoryService } from '../src/learning/learning-memory.service.js';

type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: { id: string; email: string; name: string };
};

type SessionResponse = {
  id: string;
  type: 'COMMUTE' | 'FREE_TALK' | 'PRACTICE';
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  durationSeconds: number | null;
  provider: string | null;
  model: string | null;
  transcript?: Array<{
    clientMessageId: string;
    role: 'USER' | 'ASSISTANT';
    content: string;
  }>;
};

describe('API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let learningMemory: LearningMemoryService;
  const testEmailSuffix = `${randomUUID()}@example.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SessionAnalysisService)
      .useValue({
        schedule: vi.fn().mockResolvedValue({ status: 'PENDING' }),
        reschedule: vi.fn().mockResolvedValue({ status: 'PENDING' }),
        retry: vi.fn(),
        findForUser: vi.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get(PrismaService);
    learningMemory = moduleFixture.get(LearningMemoryService);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
  });

  it('registers, authenticates, updates a profile, and completes a session', async () => {
    const email = `learner-${testEmailSuffix}`;
    const password = 'safe-password-123';

    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Test Learner' })
      .expect(201);
    const registered = registration.body as AuthResponse;

    expect(registered.accessToken).toBeTypeOf('string');
    expect(registered.user.email).toBe(email);
    expect(registration.body).not.toHaveProperty('user.passwordHash');

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: email.toUpperCase(), password })
      .expect(200);
    const authenticated = login.body as AuthResponse;
    const authorization = `Bearer ${authenticated.accessToken}`;

    await request(app.getHttpServer()).get('/sessions').expect(401);

    const profile = await request(app.getHttpServer())
      .patch('/learning/profile')
      .set('Authorization', authorization)
      .send({
        level: 'A2',
        languageMode: 'INTERMEDIATE',
        englishRatio: 0.8,
        correctionMode: 'IMPORTANT_ONLY',
      })
      .expect(200);

    expect(profile.body).toMatchObject({
      level: 'A2',
      languageMode: 'INTERMEDIATE',
      englishRatio: 0.8,
      correctionMode: 'IMPORTANT_ONLY',
    });

    const createdResponse = await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', authorization)
      .send({ type: 'COMMUTE' })
      .expect(201);
    const created = createdResponse.body as SessionResponse;

    expect(created).toMatchObject({ type: 'COMMUTE', status: 'ACTIVE' });
    await request(app.getHttpServer())
      .post('/live/token')
      .send({ sessionId: created.id })
      .expect(401);

    const userMessage = {
      clientMessageId: 'turn-1',
      role: 'USER',
      content: 'I worked on the API today.',
      occurredAt: new Date().toISOString(),
    };
    await request(app.getHttpServer())
      .post(`/sessions/${created.id}/transcript`)
      .set('Authorization', authorization)
      .send({ messages: [userMessage] })
      .expect(201)
      .expect({ accepted: 1, stored: 1 });
    await request(app.getHttpServer())
      .post(`/sessions/${created.id}/transcript`)
      .set('Authorization', authorization)
      .send({ messages: [userMessage] })
      .expect(201)
      .expect({ accepted: 1, stored: 0 });

    const completedResponse = await request(app.getHttpServer())
      .post(`/sessions/${created.id}/complete`)
      .set('Authorization', authorization)
      .send({
        messages: [
          {
            clientMessageId: 'turn-2',
            role: 'ASSISTANT',
            content: 'What part of the API did you work on?',
            occurredAt: new Date().toISOString(),
          },
        ],
      })
      .expect(201);
    const completed = completedResponse.body as SessionResponse;

    expect(completed.status).toBe('COMPLETED');
    expect(completed.durationSeconds).toBeTypeOf('number');
    expect(completed.transcript).toHaveLength(2);

    const details = await request(app.getHttpServer())
      .get(`/sessions/${created.id}`)
      .set('Authorization', authorization)
      .expect(200);
    const sessionDetails = details.body as SessionResponse;

    expect(sessionDetails.transcript).toMatchObject([
      { role: 'USER', content: 'I worked on the API today.' },
      {
        role: 'ASSISTANT',
        content: 'What part of the API did you work on?',
      },
    ]);

    const memoryInput = {
      summary: 'Người học đã nói về công việc.',
      mainTopics: ['work'],
      grammarIssues: [
        {
          pattern: 'past tense',
          original: 'Yesterday I go to work.',
          suggestion: 'Yesterday I went to work.',
          explanationVi: 'Dùng thì quá khứ cho sự việc đã xảy ra.',
        },
      ],
      newVocabulary: [
        {
          term: 'deployment',
          meaningVi: 'triển khai',
          example: 'The deployment went well.',
        },
      ],
      strengths: [],
      recommendedTopics: [],
      nextSessionFocus: ['past tense'],
    };
    await learningMemory.ingest(created.id, memoryInput);
    await learningMemory.ingest(created.id, memoryInput);

    const learningContext = await request(app.getHttpServer())
      .get('/learning/context')
      .set('Authorization', authorization)
      .expect(200);
    expect(learningContext.body).toMatchObject({
      recurringMistakes: [{ pattern: 'past tense', occurrenceCount: 1 }],
      reviewVocabulary: [{ term: 'deployment' }],
    });
    await request(app.getHttpServer())
      .post('/live/token')
      .set('Authorization', authorization)
      .send({ sessionId: created.id })
      .expect(409);

    const history = await request(app.getHttpServer())
      .get('/sessions')
      .set('Authorization', authorization)
      .expect(200);
    const sessions = history.body as SessionResponse[];

    expect(sessions.some((session) => session.id === created.id)).toBe(true);
  });

  it('does not expose another user session', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `owner-${testEmailSuffix}`,
        password: 'safe-password-123',
        name: 'Owner',
      })
      .expect(201);
    const owner = first.body as AuthResponse;

    const created = await request(app.getHttpServer())
      .post('/sessions')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'FREE_TALK' })
      .expect(201);
    const session = created.body as SessionResponse;

    const second = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `stranger-${testEmailSuffix}`,
        password: 'safe-password-123',
        name: 'Stranger',
      })
      .expect(201);
    const stranger = second.body as AuthResponse;

    await request(app.getHttpServer())
      .get(`/sessions/${session.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { endsWith: testEmailSuffix } },
      });
    }
    if (app) {
      await app.close();
    }
  });
});
