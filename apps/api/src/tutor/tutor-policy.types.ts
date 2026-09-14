export const conversationModes = [
  'FREE_CONVERSATION',
  'DAILY_LIFE',
  'WORK_SOFTWARE',
  'VOCABULARY_PRACTICE',
  'GRAMMAR_PRACTICE',
  'ROLE_PLAY',
  'PRONUNCIATION_PRACTICE',
] as const;

export type ConversationMode = (typeof conversationModes)[number];

export type TutorPolicySnapshot = {
  conversationMode: ConversationMode;
  languageMode: 'BEGINNER' | 'INTERMEDIATE' | 'IMMERSION';
  correctionMode: 'IMPORTANT_ONLY' | 'FREQUENT' | 'ON_REQUEST';
  englishRatio: number;
  level: string;
  instructions: string;
};
