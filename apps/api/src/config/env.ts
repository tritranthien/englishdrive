import 'dotenv/config';
import { z } from 'zod';

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
  LIVE_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_LIVE_MODEL: z.string().min(1).default('gemini-3.1-flash-live-preview'),
  GEMINI_ANALYSIS_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_REALTIME_MODEL: z.string().min(1).default('gpt-realtime-2.1'),
  OPENAI_REALTIME_VOICE: z.string().min(1).default('alloy'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
