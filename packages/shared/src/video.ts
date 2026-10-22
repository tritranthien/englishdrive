export type VideoSourceType = 'YOUTUBE' | 'DIRECT';
export type VideoSubtitleStatus = 'PROCESSING' | 'READY' | 'FAILED';

export type VideoSubtitleCue = {
  id: string;
  index: number;
  startMs: number;
  endMs: number;
  textEn: string;
  textVi: string;
};

export type VideoLessonSummary = {
  id: string;
  url: string;
  sourceType: VideoSourceType;
  externalId?: string | null;
  title: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  status: VideoSubtitleStatus;
  errorMessage?: string | null;
  subtitleCount: number;
  processedUntilMs?: number;
  completedChunks?: number;
  totalChunks?: number;
  createdAt: string;
  updatedAt: string;
};

export type VideoLessonDetail = VideoLessonSummary & {
  subtitles: VideoSubtitleCue[];
};

export type VideoVocabularyLookup = {
  term: string;
  pronunciation: string;
  partOfSpeech: string;
  meaningVi: string;
  explanation: string;
  example: string;
};
