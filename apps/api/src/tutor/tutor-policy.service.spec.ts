import type { LearningProfile } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { TutorPolicyService } from './tutor-policy.service.js';

function profile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    id: 'profile-id',
    userId: 'user-id',
    level: 'B1',
    preferredLanguage: 'vi',
    languageMode: 'INTERMEDIATE',
    englishRatio: 0.8,
    correctionMode: 'IMPORTANT_ONLY',
    conversationStyle: 'friendly',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TutorPolicyService', () => {
  const service = new TutorPolicyService();

  it('builds a concise commute-safe work tutor policy', () => {
    const policy = service.build(profile(), 'WORK_SOFTWARE');

    expect(policy).toMatchObject({
      conversationMode: 'WORK_SOFTWARE',
      languageMode: 'INTERMEDIATE',
      correctionMode: 'IMPORTANT_ONLY',
      level: 'B1',
    });
    expect(policy.instructions).toContain('software-engineering');
    expect(policy.instructions).toContain('one to three short sentences');
    expect(policy.instructions).toContain('never ask the learner to read');
  });

  it('changes language and correction behavior from the learning profile', () => {
    const policy = service.build(
      profile({ languageMode: 'IMMERSION', correctionMode: 'ON_REQUEST' }),
      'FREE_CONVERSATION',
    );

    expect(policy.instructions).toContain('Use English throughout');
    expect(policy.instructions).toContain('Do not correct mistakes unless');
  });

  it.each(['BEGINNER', 'INTERMEDIATE', 'IMMERSION'] as const)(
    'keeps explicit Vietnamese conversation requests above the %s defaults',
    (languageMode) => {
      const policy = service.build(profile({ languageMode }), 'ROLE_PLAY');
      expect(policy.instructions).toContain(
        'FINAL LANGUAGE OVERRIDE',
      );
      expect(policy.instructions).toContain(
        'very next response must begin immediately in Vietnamese',
      );
      expect(policy.instructions).toContain(
        'until the learner explicitly asks to switch back to English',
      );
      expect(policy.instructions).not.toContain(
        'If the learner speaks Vietnamese, help them express',
      );
    },
  );

  it('keeps Vietnamese active during Free Conversation', () => {
    const policy = service.build(profile(), 'FREE_CONVERSATION');

    expect(policy.instructions).toContain(
      'continue the free conversation in Vietnamese',
    );
    expect(policy.instructions.trim().endsWith('English.')).toBe(true);
  });
});
