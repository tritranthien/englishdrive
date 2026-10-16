import { describe, expect, it } from 'vitest';
import {
  characterSchema,
  localClock,
  nextContact,
  preferencesSchema,
  quietHour,
  threadSchema,
  threadPatchSchema,
} from './chat.schemas.js';
import { chatCatalog } from './chat.catalog.js';

describe('chat contracts and scheduling', () => {
  it('provides twelve distinct, valid adult characters', () => {
    expect(chatCatalog).toHaveLength(12);
    expect(new Set(chatCatalog.map((c) => c.id)).size).toBe(12);
    chatCatalog.forEach((c) =>
      expect(characterSchema.safeParse(c).success).toBe(true),
    );
    expect(new Set(chatCatalog.map((c) => c.gender)).size).toBeGreaterThan(1);
    expect(new Set(chatCatalog.map((c) => c.occupation)).size).toBe(12);
  });
  it('handles overnight quiet hours, daytime ranges and disabled quiet hours', () => {
    expect(quietHour(23, 22, 8)).toBe(true);
    expect(quietHour(7, 22, 8)).toBe(true);
    expect(quietHour(8, 22, 8)).toBe(false);
    expect(quietHour(21, 22, 8)).toBe(false);
    expect(quietHour(10, 9, 17)).toBe(true);
    expect(quietHour(17, 9, 17)).toBe(false);
    expect(quietHour(1, 0, 0)).toBe(false);
    expect(
      localClock(new Date('2026-10-16T18:00:00Z'), 'Asia/Ho_Chi_Minh'),
    ).toEqual({ day: '2026-10-17', hour: 1 });
  });
  it('draws a new future time inside the configured range without catching up missed rounds', () => {
    const now = new Date('2026-10-17T00:00:00Z');
    expect(nextContact(120, 360, now, () => 0).toISOString()).toBe(
      '2026-10-17T02:00:00.000Z',
    );
    expect(nextContact(120, 360, now, () => 0.5).toISOString()).toBe(
      '2026-10-17T04:00:00.000Z',
    );
  });
  it('rejects invalid intervals, timezones and group composition', () => {
    const prefs = {
      enabled: true,
      minMinutes: 120,
      maxMinutes: 60,
      dailyLimit: 6,
      quietStart: 22,
      quietEnd: 8,
      timezone: 'UTC',
    };
    expect(preferencesSchema.safeParse(prefs).success).toBe(false);
    expect(
      preferencesSchema.safeParse({
        ...prefs,
        maxMinutes: 360,
        timezone: 'Unknown/Somewhere',
      }).success,
    ).toBe(false);
    expect(threadPatchSchema.safeParse({ minMinutes: 10 }).success).toBe(false);
    expect(threadPatchSchema.safeParse({ title: 'New name' }).success).toBe(
      true,
    );
    const id = '12345678-1234-4123-8123-123456789012';
    expect(
      threadSchema.safeParse({
        kind: 'GROUP',
        title: 'Friends',
        characterIds: [id, id],
      }).success,
    ).toBe(false);
    expect(
      threadSchema.safeParse({
        kind: 'DIRECT',
        title: 'Friend',
        characterIds: [id],
      }).success,
    ).toBe(true);
  });
});
