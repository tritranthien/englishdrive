import { z } from 'zod';
import { conversationModes } from '../tutor/tutor-policy.types.js';

export const createLiveTokenSchema = z.object({
  sessionId: z.string().uuid(),
  conversationMode: z.enum(conversationModes).default('FREE_CONVERSATION'),
});

export const geminiAuthTokenSchema = z.object({
  name: z.string().min(1),
  expireTime: z.string().optional(),
  newSessionExpireTime: z.string().optional(),
});

export type CreateLiveTokenInput = z.infer<typeof createLiveTokenSchema>;
