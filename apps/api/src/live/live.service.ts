import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseEnvironment } from '../config/env.js';
import { LearningProfileService } from '../learning-profile/learning-profile.service.js';
import { LearningContextService } from '../learning/learning-context.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { TutorPolicyService } from '../tutor/tutor-policy.service.js';
import type { ConversationMode } from '../tutor/tutor-policy.types.js';
import { geminiAuthTokenSchema } from './live.schemas.js';

const GEMINI_AUTH_TOKENS_URL =
  'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
const TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
const NEW_SESSION_LIFETIME_MS = 60 * 1000;

// The learner screen shows whatever the tutor calls this function with, so the
// declaration stays server-side and travels to the device with the live token.
const GEMINI_LIVE_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'show_vocabulary',
        description:
          'Show an English word or phrase on the learner screen together with a short Vietnamese meaning. Call this every time you teach, translate, or explain a word or phrase.',
        parameters: {
          type: 'OBJECT',
          properties: {
            term: {
              type: 'STRING',
              description: 'The exact English word or phrase you just said.',
            },
            meaningVi: {
              type: 'STRING',
              description: 'Short Vietnamese meaning of the term.',
            },
            example: {
              type: 'STRING',
              description: 'One short English example sentence.',
            },
          },
          required: ['term', 'meaningVi'],
        },
      },
    ],
  },
];

@Injectable()
export class LiveService {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly learningProfileService: LearningProfileService,
    private readonly tutorPolicyService: TutorPolicyService,
    private readonly learningContextService: LearningContextService,
  ) {}

  async createGeminiToken(
    userId: string,
    sessionId: string,
    conversationMode: ConversationMode = 'FREE_CONVERSATION',
  ) {
    await this.sessionsService.requireActive(userId, sessionId);
    const [profile, learningContext] = await Promise.all([
      this.learningProfileService.findForUser(userId),
      this.learningContextService.build(userId),
    ]);
    const tutorPolicy = this.tutorPolicyService.build(
      profile,
      conversationMode,
      this.learningContextService.format(learningContext),
    );
    const env = parseEnvironment(process.env);
    if (!env.GEMINI_API_KEY) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY is not configured on the API server',
      );
    }

    const now = Date.now();
    const expireTime = new Date(now + TOKEN_LIFETIME_MS).toISOString();
    const newSessionExpireTime = new Date(
      now + NEW_SESSION_LIFETIME_MS,
    ).toISOString();
    const model = env.GEMINI_LIVE_MODEL;
    let response: Response;
    try {
      response = await fetch(GEMINI_AUTH_TOKENS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
        }),
      });
    } catch {
      throw new BadGatewayException('Gemini token provisioning is unavailable');
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `Gemini token provisioning failed (${response.status})`,
      );
    }
    const token = geminiAuthTokenSchema.safeParse(await response.json());
    if (!token.success) {
      throw new BadGatewayException(
        'Gemini returned an invalid token provisioning response',
      );
    }

    await this.sessionsService.setProvider(userId, sessionId, 'gemini', model);

    return {
      provider: 'gemini' as const,
      token: token.data.name,
      expiresAt: token.data.expireTime ?? expireTime,
      newSessionExpiresAt:
        token.data.newSessionExpireTime ?? newSessionExpireTime,
      model,
      tutor: {
        conversationMode: tutorPolicy.conversationMode,
        languageMode: tutorPolicy.languageMode,
        correctionMode: tutorPolicy.correctionMode,
        englishRatio: tutorPolicy.englishRatio,
        level: tutorPolicy.level,
      },
      learningContext,
      sessionConfig: {
        systemInstruction: tutorPolicy.instructions,
        tools: GEMINI_LIVE_TOOLS,
      },
    };
  }
}
