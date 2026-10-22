import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { VideosAiService } from './videos-ai.service.js';
import {
  createVideoSchema,
  parseVideoUrl,
  videoVocabularySelectionSchema,
} from './videos.schemas.js';
import { VideosService } from './videos.service.js';

describe('videos schemas and service', () => {
  it('persists a completed chunk before a later failure and resumes from that checkpoint', async () => {
    const cue = {
      id: 'cue-1',
      index: 1,
      startMs: 1000,
      endMs: 2000,
      textEn: 'Hello.',
      textVi: 'Xin chào.',
    };
    let stored = {
      id: 'video',
      userId: 'user',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'PROCESSING',
      title: 'Lesson',
      durationSeconds: 3600,
      processedUntilMs: 0,
      subtitles: [] as (typeof cue)[],
      createdAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null as string | null,
    };
    const update = vi.fn(async ({ data }) => {
      stored = { ...stored, ...data };
      return stored;
    });
    const prisma = {
      videoLesson: {
        findUnique: vi.fn(async () => stored),
        findFirst: vi.fn(async () => stored),
        update,
      },
    };
    const generateSubtitles = vi.fn(async (_source, options) => {
      await options.onProgress({
        title: 'Lesson',
        durationMs: 3600000,
        processedUntilMs: 900000,
        cues: [cue],
      });
      expect(stored.status).toBe('PROCESSING');
      expect(stored.subtitles).toEqual([cue]);
      throw new Error('Second chunk failed');
    });
    const service = new VideosService(
      prisma as unknown as PrismaService,
      { generateSubtitles } as unknown as VideosAiService,
    );
    await service.processVideo('video');
    expect(stored.status).toBe('FAILED');
    expect(stored.processedUntilMs).toBe(900000);
    expect(stored.subtitles).toEqual([cue]);
    const detail = await service.get('user', 'video');
    expect(detail.completedChunks).toBe(1);
    expect(detail.totalChunks).toBe(4);
    generateSubtitles.mockImplementationOnce(async (_source, options) => {
      expect(options.startMs).toBe(900000);
      expect(options.cues).toEqual([cue]);
      return { durationMs: 3600000, cues: [cue] } as never;
    });
    await service.retry('user', 'video');
    await vi.waitFor(() => expect(stored.status).toBe('READY'));
  });
  it('parses YouTube watch, short, and youtu.be URLs into canonical YouTube source', () => {
    const watch = parseVideoUrl(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s',
    );
    expect(watch).toEqual({
      sourceType: 'YOUTUBE',
      externalId: 'dQw4w9WgXcQ',
      normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      defaultTitle: 'YouTube Video (dQw4w9WgXcQ)',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });

    const shortLink = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?si=abc');
    expect(shortLink?.externalId).toBe('dQw4w9WgXcQ');
    expect(shortLink?.sourceType).toBe('YOUTUBE');

    const shorts = parseVideoUrl('https://youtube.com/shorts/dQw4w9WgXcQ');
    expect(shorts?.externalId).toBe('dQw4w9WgXcQ');
    expect(shorts?.sourceType).toBe('YOUTUBE');
  });

  it('parses direct MP4/HLS video URLs and rejects non-http URLs', () => {
    const direct = parseVideoUrl(
      'https://cdn.example.com/lessons/daily-english-lesson.mp4',
    );
    expect(direct).toEqual({
      sourceType: 'DIRECT',
      externalId: null,
      normalizedUrl: 'https://cdn.example.com/lessons/daily-english-lesson.mp4',
      defaultTitle: 'daily english lesson',
      thumbnailUrl: null,
    });

    expect(parseVideoUrl('ftp://example.com/video.mp4')).toBeNull();
    expect(parseVideoUrl('not-a-url')).toBeNull();
    expect(
      createVideoSchema.safeParse({ url: 'https://youtu.be/dQw4w9WgXcQ' })
        .success,
    ).toBe(true);
  });

  it('validates vocabulary selection ranges on subtitle cues', () => {
    expect(
      videoVocabularySelectionSchema.safeParse({
        cueId: 'cue-1',
        start: 0,
        end: 12,
      }).success,
    ).toBe(true);
    expect(
      videoVocabularySelectionSchema.safeParse({
        cueId: 'cue-1',
        start: 10,
        end: 10,
      }).success,
    ).toBe(false);
  });

  it('creates a video lesson, processes bilingual subtitles, and looks up subtitle vocabulary', async () => {
    const now = new Date('2026-10-18T12:00:00Z');
    let stored: Record<string, unknown> = {
      id: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      sourceType: 'YOUTUBE',
      externalId: 'dQw4w9WgXcQ',
      title: 'YouTube Video (dQw4w9WgXcQ)',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      durationSeconds: null,
      status: 'PROCESSING',
      subtitles: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    const prisma = {
      videoLesson: {
        findFirst: vi.fn().mockImplementation(async () => null),
        create: vi.fn().mockImplementation(async () => stored),
        findUnique: vi.fn().mockImplementation(async () => stored),
        update: vi.fn().mockImplementation(async ({ data }) => {
          stored = { ...stored, ...data };
          return stored;
        }),
      },
    } as unknown as PrismaService;

    const ai = {
      generateSubtitles: vi.fn().mockResolvedValue({
        title: 'Daily English Conversation',
        cues: [
          {
            id: 'cue-1',
            index: 1,
            startMs: 1000,
            endMs: 4200,
            textEn: 'Welcome to our daily English practice.',
            textVi: 'Chào mừng bạn đến với buổi luyện tiếng Anh hàng ngày.',
          },
        ],
      }),
      lookupVocabulary: vi.fn().mockResolvedValue({
        term: 'daily practice',
        meaningVi: 'luyện tập hàng ngày',
        pronunciation: '/ˈdeɪli ˈpræktɪs/',
        partOfSpeech: 'cụm danh từ',
        explanation: 'Chỉ thói quen rèn luyện mỗi ngày.',
        example: 'Daily practice improves your fluency.',
      }),
    } as unknown as VideosAiService;

    const service = new VideosService(prisma, ai);
    const created = await service.create(
      'user-1',
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(created.sourceType).toBe('YOUTUBE');

    await service.processVideo(created.id);
    expect(stored.status).toBe('READY');
    expect(stored.title).toBe('Daily English Conversation');

    (
      prisma.videoLesson.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(stored);
    const vocab = await service.lookupVocabulary(
      'user-1',
      created.id,
      'cue-1',
      15,
      20,
    );
    expect(vocab.meaningVi).toBe('luyện tập hàng ngày');
  });
});
