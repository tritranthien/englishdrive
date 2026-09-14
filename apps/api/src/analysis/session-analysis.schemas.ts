import { z } from 'zod';

export const sessionAnalysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
  mainTopics: z.array(z.string().trim().min(1).max(100)).max(6),
  grammarIssues: z
    .array(
      z.object({
        pattern: z.string().trim().min(1).max(100),
        original: z.string().trim().min(1).max(500),
        suggestion: z.string().trim().min(1).max(500),
        explanationVi: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(10),
  newVocabulary: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(100),
        meaningVi: z.string().trim().min(1).max(500),
        example: z.string().trim().min(1).max(500),
      }),
    )
    .max(12),
  strengths: z
    .array(
      z.object({
        example: z.string().trim().min(1).max(500),
        reasonVi: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(8),
  recommendedTopics: z.array(z.string().trim().min(1).max(150)).max(5),
  nextSessionFocus: z.array(z.string().trim().min(1).max(150)).max(3),
});

export type SessionAnalysisOutput = z.infer<typeof sessionAnalysisOutputSchema>;

export const sessionAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'A concise Vietnamese summary.' },
    mainTopics: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
    },
    grammarIssues: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pattern: { type: 'string' },
          original: { type: 'string' },
          suggestion: { type: 'string' },
          explanationVi: { type: 'string' },
        },
        required: ['pattern', 'original', 'suggestion', 'explanationVi'],
      },
    },
    newVocabulary: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          term: { type: 'string' },
          meaningVi: { type: 'string' },
          example: { type: 'string' },
        },
        required: ['term', 'meaningVi', 'example'],
      },
    },
    strengths: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          example: { type: 'string' },
          reasonVi: { type: 'string' },
        },
        required: ['example', 'reasonVi'],
      },
    },
    recommendedTopics: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string' },
    },
    nextSessionFocus: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string' },
    },
  },
  required: [
    'summary',
    'mainTopics',
    'grammarIssues',
    'newVocabulary',
    'strengths',
    'recommendedTopics',
    'nextSessionFocus',
  ],
} as const;
