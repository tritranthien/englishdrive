import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const characterSchema = z.object({
  name: text(60),
  age: z.number().int().min(18).max(100),
  gender: text(60),
  occupation: text(120),
  bio: text(1000),
  personality: text(1000),
  interests: text(500),
  speakingStyle: text(500),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#55ddb6'),
});
export type CharacterInput = z.infer<typeof characterSchema>;
const intervals = <
  T extends { minMinutes?: number | null; maxMinutes?: number | null },
>(
  value: T,
) =>
  (value.minMinutes == null && value.maxMinutes == null) ||
  (value.minMinutes != null &&
    value.maxMinutes != null &&
    value.maxMinutes >= value.minMinutes);
export const preferencesSchema = z
  .object({
    enabled: z.boolean(),
    minMinutes: z.number().int().min(5).max(10080),
    maxMinutes: z.number().int().min(5).max(10080),
    dailyLimit: z.number().int().min(1).max(50),
    quietStart: z.number().int().min(0).max(23),
    quietEnd: z.number().int().min(0).max(23),
    timezone: text(80).refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone'),
  })
  .refine(intervals, 'Maximum interval must be at least the minimum');
export const threadSchema = z
  .object({
    kind: z.enum(['DIRECT', 'GROUP']),
    title: text(100),
    characterIds: z
      .array(z.string().uuid())
      .min(1)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .refine(
    (value) =>
      value.kind === 'GROUP'
        ? value.characterIds.length >= 2
        : value.characterIds.length === 1,
    'Select one friend or 2–6 group members',
  );
export const threadPatchSchema = z
  .object({
    title: text(100).optional(),
    romance: z.boolean().optional(),
    archived: z.boolean().optional(),
    muted: z.boolean().optional(),
    proactiveEnabled: z.boolean().optional(),
    minMinutes: z.number().int().min(5).max(10080).nullable().optional(),
    maxMinutes: z.number().int().min(5).max(10080).nullable().optional(),
    characterIds: z
      .array(z.string().uuid())
      .min(2)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
  })
  .refine(intervals, 'Set both interval values, or reset both to null');
export const sendSchema = z.object({
  clientMessageId: z.string().uuid(),
  content: text(4000),
});
export const pageSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().min(0).optional(),
});
export const deviceSchema = z.object({
  token: text(4096),
  installationId: z.string().uuid(),
});
export const helpSchema = z
  .object({
    action: z.enum(['translate', 'explain', 'suggest']),
    messageId: z.string().uuid().optional(),
  })
  .refine(
    (value) => value.action === 'suggest' || value.messageId != null,
    'Select a message',
  );
export const generatedSchema = z.object({
  messages: z
    .array(z.object({ characterId: z.string(), content: text(1200) }))
    .min(1)
    .max(4),
});

export function localClock(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  };
}
export function quietHour(hour: number, start: number, end: number) {
  return start === end
    ? false
    : start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end;
}
export function nextContact(
  min: number,
  max: number,
  now = new Date(),
  random = Math.random,
) {
  return new Date(now.getTime() + (min + random() * (max - min)) * 60000);
}
