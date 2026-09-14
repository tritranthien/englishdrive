import { z } from 'zod';

export const createRealtimeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export const openAiClientSecretSchema = z.object({
  value: z.string().min(1),
  expires_at: z.number(),
  session: z.object({
    id: z.string().min(1),
    model: z.string().min(1),
  }),
});

export type CreateRealtimeSessionInput = z.infer<
  typeof createRealtimeSessionSchema
>;
