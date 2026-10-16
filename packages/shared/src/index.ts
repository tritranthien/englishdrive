export const APP_NAME = 'English Drive';
export type {
  ChatCharacterInput,
  ChatCharacter,
  ChatPreferences,
  ChatMessage,
  ChatThread,
  ChatMessagePage,
} from './chat.js';

export type HealthStatus = {
  status: 'ok';
  database: 'connected';
};
