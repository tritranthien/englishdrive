import { z } from 'zod';

export const updateLearningProfileSchema = z
  .object({
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'UNKNOWN']).optional(),
    preferredLanguage: z.string().trim().min(2).max(10).optional(),
    languageMode: z.enum(['BEGINNER', 'INTERMEDIATE', 'IMMERSION']).optional(),
    englishRatio: z.number().min(0).max(1).optional(),
    correctionMode: z
      .enum(['IMPORTANT_ONLY', 'FREQUENT', 'ON_REQUEST'])
      .optional(),
    conversationStyle: z.string().trim().min(1).max(40).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one profile field is required',
  });

export type UpdateLearningProfileInput = z.infer<
  typeof updateLearningProfileSchema
>;
