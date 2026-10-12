import { z } from 'zod';

export const vocabularyWordSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    meaningVi: z.string().trim().min(1).max(1000),
    example: z.string().trim().max(2000).optional(),
  })
  .strict();
export const vocabularyImportSchema = z
  .object({
    words: z.array(vocabularyWordSchema).min(1).max(100),
  })
  .strict();
export const vocabularyListSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();
export type VocabularyWordInput = z.infer<typeof vocabularyWordSchema>;
export type VocabularyListInput = z.infer<typeof vocabularyListSchema>;
