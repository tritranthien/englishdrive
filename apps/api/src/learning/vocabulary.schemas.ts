import { z } from 'zod';

export const vocabularyWordSchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    meaningVi: z.string().trim().min(1).max(1000),
    example: z.string().trim().max(2000).optional(),
    deckId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const vocabularyImportSchema = z
  .object({
    words: z
      .array(vocabularyWordSchema.omit({ deckId: true }))
      .min(1)
      .max(100),
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

export const vocabularyDeckSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine(
        (name) =>
          name
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase('vi') !== 'chưa phân loại',
        'Tên này dành cho bộ mặc định',
      ),
  })
  .strict();
export const vocabularyAssignmentSchema = z
  .object({
    wordIds: z.array(z.string().uuid()).min(1).max(100),
    deckId: z.string().uuid().nullable(),
  })
  .strict();
export type VocabularyAssignmentInput = z.infer<
  typeof vocabularyAssignmentSchema
>;
