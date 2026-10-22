export const APP_NAME = 'English Drive';
export type {
  DraftReplacement,
  DraftTranslationRequest,
  DraftTranslationResponse,
} from './draft-translation.js';
export { backtickSpans, replaceDraftSpans } from './draft-translation.js';
export type {
  ChatCharacterInput,
  ChatCharacter,
  ChatPreferences,
  ChatMessage,
  ChatThread,
  ChatMessagePage,
} from './chat.js';
export type {
  VideoSourceType,
  VideoSubtitleStatus,
  VideoSubtitleCue,
  VideoLessonSummary,
  VideoLessonDetail,
  VideoVocabularyLookup,
} from './video.js';

export type HealthStatus = {
  status: 'ok';
  database: 'connected';
};
