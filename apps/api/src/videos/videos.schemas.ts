import { z } from 'zod';

export const createVideoSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export const videoVocabularySelectionSchema = z
  .object({
    cueId: z.string().min(1).max(80),
    start: z.number().int().min(0).max(2000),
    end: z.number().int().min(1).max(2000),
  })
  .refine((v) => v.end > v.start && v.end - v.start <= 120, {
    message: 'Hãy chọn từ hoặc cụm từ không quá 120 ký tự',
  });

export const generatedSubtitleCueSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(100),
  textEn: z.string().trim().min(1).max(600),
  textVi: z.string().trim().min(1).max(800),
});

export const generatedSubtitlesResponseSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  cues: z.array(generatedSubtitleCueSchema).min(1).max(400),
});

export const generatedSubtitlesJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    cues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          startMs: { type: 'integer' },
          endMs: { type: 'integer' },
          textEn: { type: 'string' },
          textVi: { type: 'string' },
        },
        required: ['startMs', 'endMs', 'textEn', 'textVi'],
      },
    },
  },
  required: ['cues'],
} as const;

export const videoVocabularyDefinitionSchema = z.object({
  meaningVi: z.string().trim().min(1).max(300),
  pronunciation: z.string().trim().min(1).max(120),
  partOfSpeech: z.string().trim().min(1).max(80),
  explanation: z.string().trim().min(1).max(600),
  example: z.string().trim().min(1).max(400),
});

export const videoVocabularyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meaningVi: { type: 'string' },
    pronunciation: { type: 'string' },
    partOfSpeech: { type: 'string' },
    explanation: { type: 'string' },
    example: { type: 'string' },
  },
  required: [
    'meaningVi',
    'pronunciation',
    'partOfSpeech',
    'explanation',
    'example',
  ],
} as const;

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
  sourceType: 'YOUTUBE' | 'DIRECT';
  externalId?: string | null;
  title: string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
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

export type ParsedVideoSource = {
  sourceType: 'YOUTUBE' | 'DIRECT';
  externalId: string | null;
  normalizedUrl: string;
  defaultTitle: string;
  thumbnailUrl: string | null;
};

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoUrl(rawUrl: string): ParsedVideoSource | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  let youtubeId: string | null = null;

  if (host === 'youtu.be') {
    const candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    if (YOUTUBE_ID_REGEX.test(candidate)) youtubeId = candidate;
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = parsed.searchParams.get('v');
    if (vParam && YOUTUBE_ID_REGEX.test(vParam)) {
      youtubeId = vParam;
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        ['shorts', 'embed', 'live', 'v'].includes(segments[0]) &&
        YOUTUBE_ID_REGEX.test(segments[1])
      ) {
        youtubeId = segments[1];
      }
    }
  }

  if (youtubeId) {
    return {
      sourceType: 'YOUTUBE',
      externalId: youtubeId,
      normalizedUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      defaultTitle: `YouTube Video (${youtubeId})`,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const lastSegment =
    parsed.pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z0-9]{2,5}$/i, '') ?? '';
  const decodedName = decodeURIComponent(lastSegment)
    .replace(/[-_]+/g, ' ')
    .trim();

  return {
    sourceType: 'DIRECT',
    externalId: null,
    normalizedUrl: parsed.toString(),
    defaultTitle: decodedName || `Video từ ${host}`,
    thumbnailUrl: null,
  };
}
