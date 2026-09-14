import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseEnvironment } from '../config/env.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { openAiClientSecretSchema } from './realtime.schemas.js';

@Injectable()
export class RealtimeService {
  constructor(private readonly sessionsService: SessionsService) {}

  async createClientSecret(userId: string, sessionId: string) {
    await this.sessionsService.requireActive(userId, sessionId);
    const env = parseEnvironment(process.env);

    if (!env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured on the API server',
      );
    }

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expires_after: { anchor: 'created_at', seconds: 60 },
          session: {
            type: 'realtime',
            model: env.OPENAI_REALTIME_MODEL,
            output_modalities: ['audio'],
            instructions:
              'You are a friendly English conversation partner. Keep responses natural and concise. The user may speak English or Vietnamese.',
            max_output_tokens: 300,
            audio: {
              input: {
                noise_reduction: { type: 'near_field' },
                turn_detection: {
                  type: 'server_vad',
                  create_response: true,
                  interrupt_response: true,
                  silence_duration_ms: 500,
                  prefix_padding_ms: 300,
                },
              },
              output: { voice: env.OPENAI_REALTIME_VOICE },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new BadGatewayException(
        `OpenAI Realtime authorization failed with status ${response.status}`,
      );
    }

    const parsed = openAiClientSecretSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new BadGatewayException(
        'OpenAI returned an invalid Realtime authorization response',
      );
    }

    return {
      clientSecret: parsed.data.value,
      expiresAt: parsed.data.expires_at,
      realtimeSessionId: parsed.data.session.id,
      model: parsed.data.session.model,
    };
  }
}
