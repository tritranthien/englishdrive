import { apiRequest } from '../../api/client';
import type {
  VideoLessonDetail,
  VideoLessonSummary,
  VideoVocabularyLookup,
} from '../../../../../packages/shared/src/video';

export type {
  VideoLessonDetail,
  VideoLessonSummary,
  VideoSourceType,
  VideoSubtitleCue,
  VideoSubtitleStatus,
  VideoVocabularyLookup,
} from '../../../../../packages/shared/src/video';

export const videoApi = {
  list: (token: string) =>
    apiRequest<VideoLessonSummary[]>('/videos', { token }),
  create: (token: string, url: string) =>
    apiRequest<VideoLessonDetail>('/videos', {
      token,
      method: 'POST',
      body: { url },
      timeoutMs: 30000,
    }),
  get: (token: string, id: string) =>
    apiRequest<VideoLessonDetail>(`/videos/${id}`, { token }),
  retry: (token: string, id: string) =>
    apiRequest<VideoLessonDetail>(`/videos/${id}/retry`, {
      token,
      method: 'POST',
      timeoutMs: 30000,
    }),
  remove: (token: string, id: string) =>
    apiRequest<{ ok: boolean }>(`/videos/${id}`, {
      token,
      method: 'DELETE',
    }),
  vocabulary: (
    token: string,
    id: string,
    cueId: string,
    start: number,
    end: number,
  ) =>
    apiRequest<VideoVocabularyLookup>(`/videos/${id}/vocabulary`, {
      token,
      method: 'POST',
      body: { cueId, start, end },
      timeoutMs: 40000,
    }),
};
