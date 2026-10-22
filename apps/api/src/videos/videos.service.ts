import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { VideoLesson } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { VideosAiService, VIDEO_CHUNK_MS } from './videos-ai.service.js';
import {
  parseVideoUrl,
  type VideoLessonDetail,
  type VideoLessonSummary,
  type VideoSubtitleCue,
} from './videos.schemas.js';

@Injectable()
export class VideosService implements OnModuleInit {
  private readonly running = new Set<string>();
  private processingQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: VideosAiService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const pending = await this.prisma.videoLesson.findMany({
      where: { status: 'PROCESSING' },
      select: { id: true },
    });
    for (const item of pending) {
      this.kickoff(item.id);
    }
  }

  async list(userId: string): Promise<VideoLessonSummary[]> {
    const rows = await this.prisma.videoLesson.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.toSummary(row));
  }

  async get(userId: string, id: string): Promise<VideoLessonDetail> {
    const row = await this.prisma.videoLesson.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy video');
    return this.toDetail(row);
  }

  async create(userId: string, rawUrl: string): Promise<VideoLessonDetail> {
    const source = parseVideoUrl(rawUrl);
    if (!source) {
      throw new BadRequestException(
        'Link video không hợp lệ. Hãy dán link YouTube hoặc link video trực tiếp (http/https).',
      );
    }

    const existing = await this.prisma.videoLesson.findFirst({
      where: { userId, url: source.normalizedUrl },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      if (existing.status === 'READY') {
        return this.toDetail(existing);
      }
      const updated = await this.prisma.videoLesson.update({
        where: { id: existing.id },
        data: { status: 'PROCESSING', errorMessage: null },
      });
      this.kickoff(updated.id);
      return this.toDetail(updated);
    }

    const created = await this.prisma.videoLesson.create({
      data: {
        userId,
        url: source.normalizedUrl,
        sourceType: source.sourceType,
        externalId: source.externalId,
        title: source.defaultTitle,
        thumbnailUrl: source.thumbnailUrl,
        status: 'PROCESSING',
      },
    });
    this.kickoff(created.id);
    return this.toDetail(created);
  }

  async retry(userId: string, id: string): Promise<VideoLessonDetail> {
    const row = await this.prisma.videoLesson.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Không tìm thấy video');
    const updated = await this.prisma.videoLesson.update({
      where: { id: row.id },
      data: {
        status: 'PROCESSING',
        errorMessage: null,
        ...(row.status === 'READY'
          ? { processedUntilMs: 0, subtitles: [] }
          : {}),
      },
    });
    this.kickoff(updated.id);
    return this.toDetail(updated);
  }

  async remove(userId: string, id: string) {
    const deleted = await this.prisma.videoLesson.deleteMany({
      where: { id, userId },
    });
    if (!deleted.count) throw new NotFoundException('Không tìm thấy video');
    return { ok: true };
  }

  async lookupVocabulary(
    userId: string,
    id: string,
    cueId: string,
    start: number,
    end: number,
  ) {
    const detail = await this.get(userId, id);
    const cue = detail.subtitles.find((item) => item.id === cueId);
    if (!cue) throw new NotFoundException('Không tìm thấy câu phụ đề');

    const term = cue.textEn.slice(start, end).trim();
    if (
      start < 0 ||
      end <= start ||
      end > cue.textEn.length ||
      term.length > 120 ||
      !/\p{L}/u.test(term)
    ) {
      throw new BadRequestException(
        'Hãy chọn từ hoặc cụm từ tiếng Anh không quá 120 ký tự trong câu phụ đề',
      );
    }

    return this.ai.lookupVocabulary(term, cue.textEn, cue.textVi);
  }

  private kickoff(videoId: string) {
    if (this.running.has(videoId)) return;
    this.running.add(videoId);
    this.processingQueue = this.processingQueue
      .then(() => this.processVideo(videoId))
      .catch(() => {})
      .finally(() => {
        this.running.delete(videoId);
      });
  }

  async processVideo(videoId: string) {
    const video = await this.prisma.videoLesson.findUnique({
      where: { id: videoId },
    });
    if (!video || video.status !== 'PROCESSING') return;

    const source = parseVideoUrl(video.url);
    if (!source) {
      await this.prisma.videoLesson.update({
        where: { id: videoId },
        data: {
          status: 'FAILED',
          errorMessage: 'Link video không hợp lệ',
        },
      });
      return;
    }

    try {
      const generated = await this.ai.generateSubtitles(source, {
        startMs: video.processedUntilMs ?? 0,
        durationMs: video.durationSeconds
          ? video.durationSeconds * 1000
          : undefined,
        cues: this.parseCues(video.subtitles),
        onProgress: async (progress) => {
          await this.prisma.videoLesson.update({
            where: { id: videoId },
            data: {
              title: progress.title?.trim() || video.title,
              durationSeconds: Math.ceil(progress.durationMs / 1000),
              processedUntilMs: progress.processedUntilMs,
              subtitles: progress.cues,
            },
          });
        },
      });
      const lastCue = generated.cues[generated.cues.length - 1];
      const durationSeconds = generated.durationMs
        ? Math.ceil(generated.durationMs / 1000)
        : lastCue
          ? Math.ceil(lastCue.endMs / 1000)
          : undefined;

      await this.prisma.videoLesson.update({
        where: { id: videoId },
        data: {
          title: generated.title?.trim() || video.title,
          durationSeconds: durationSeconds ?? video.durationSeconds,
          status: 'READY',
          processedUntilMs: generated.durationMs ?? lastCue?.endMs ?? 0,
          subtitles: generated.cues,
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.prisma.videoLesson.update({
        where: { id: videoId },
        data: {
          status: 'FAILED',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Chưa tạo được phụ đề song ngữ cho video này',
        },
      });
    }
  }

  private parseCues(raw: unknown): VideoSubtitleCue[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is VideoSubtitleCue =>
      Boolean(
        item &&
          typeof item === 'object' &&
          typeof (item as VideoSubtitleCue).id === 'string' &&
          typeof (item as VideoSubtitleCue).startMs === 'number' &&
          typeof (item as VideoSubtitleCue).endMs === 'number' &&
          Number.isFinite((item as VideoSubtitleCue).startMs) &&
          Number.isFinite((item as VideoSubtitleCue).endMs) &&
          (item as VideoSubtitleCue).startMs >= 0 &&
          (item as VideoSubtitleCue).endMs >
            (item as VideoSubtitleCue).startMs &&
          typeof (item as VideoSubtitleCue).textEn === 'string' &&
          typeof (item as VideoSubtitleCue).textVi === 'string',
      ),
    );
  }

  private toSummary(row: VideoLesson): VideoLessonSummary {
    const subtitles = this.parseCues(row.subtitles);
    return {
      id: row.id,
      url: row.url,
      sourceType: row.sourceType,
      externalId: row.externalId,
      title: row.title,
      thumbnailUrl: row.thumbnailUrl,
      durationSeconds: row.durationSeconds,
      status: row.status,
      errorMessage: row.errorMessage,
      subtitleCount: subtitles.length,
      processedUntilMs:
        row.status === 'READY'
          ? (row.durationSeconds ?? 0) * 1000
          : (row.processedUntilMs ?? 0),
      completedChunks: Math.ceil(
        (row.status === 'READY'
          ? (row.durationSeconds ?? 0) * 1000
          : (row.processedUntilMs ?? 0)) / VIDEO_CHUNK_MS,
      ),
      totalChunks: row.durationSeconds
        ? Math.ceil((row.durationSeconds * 1000) / VIDEO_CHUNK_MS)
        : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: VideoLesson): VideoLessonDetail {
    const subtitles = this.parseCues(row.subtitles);
    return {
      ...this.toSummary(row),
      subtitles,
    };
  }
}
