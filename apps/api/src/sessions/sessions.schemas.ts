import { z } from 'zod';

export const createSessionSchema = z.object({
  type: z.enum(['COMMUTE', 'FREE_TALK', 'PRACTICE']),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const transcriptMessageSchema = z.object({
  clientMessageId: z.string().min(1).max(100),
  role: z.enum(['USER', 'ASSISTANT']),
  content: z.string().trim().min(1).max(20_000),
  occurredAt: z.iso.datetime({ offset: true }),
});

export const appendTranscriptSchema = z.object({
  messages: z.array(transcriptMessageSchema).min(1).max(50),
});

export const completeSessionSchema = z
  .object({
    messages: z.array(transcriptMessageSchema).max(50).default([]),
  })
  .default({ messages: [] });

export type TranscriptMessageInput = z.infer<typeof transcriptMessageSchema>;
export type AppendTranscriptInput = z.infer<typeof appendTranscriptSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
