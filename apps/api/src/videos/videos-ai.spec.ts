import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideosAiService } from './videos-ai.service.js';
import { parseVideoUrl } from './videos.schemas.js';

describe('YouTube source timing', () => {
  beforeEach(() => vi.stubEnv('GEMINI_API_KEY', 'unit-test-key'));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('processes a 60-minute video in four 15-minute chunks and publishes subtitles before completion', async () => {
    const starts: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const { startSeconds, chunkSeconds } = JSON.parse(init.body);
        starts.push(startSeconds);
        expect(chunkSeconds).toBe(900);
        return {
          ok: true,
          json: async () => ({
            source: 'caption',
            languageCode: 'en',
            title: 'Long lesson',
            durationMs: 3600000,
            segments: [
              {
                id: 's',
                startMs: startSeconds * 1000 + 1000,
                endMs: startSeconds * 1000 + 2000,
                text: 'Hello.',
              },
            ],
          }),
        };
      }),
    );
    const ai = new VideosAiService();
    vi.spyOn(
      ai as unknown as {
        callGeminiStructured: (...args: unknown[]) => Promise<unknown>;
      },
      'callGeminiStructured',
    ).mockResolvedValue({
      cues: [{ id: 's', textEn: 'Hello.', textVi: 'Xin chào.' }],
    });
    const checkpoints: number[] = [];
    const result = await ai.generateSubtitles(
      parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!,
      {
        onProgress: async (progress) => {
          checkpoints.push(progress.processedUntilMs);
          if (progress.processedUntilMs === 900000 && starts.length === 1)
            expect(progress.cues).toHaveLength(1);
        },
      },
    );
    expect(starts).toEqual([0, 900, 1800, 2700]);
    expect(checkpoints).toEqual(
      expect.arrayContaining([900000, 1800000, 2700000, 3600000]),
    );
    expect(result.cues.map((cue) => cue.startMs)).toEqual([
      1000, 901000, 1801000, 2701000,
    ]);
    expect(result.cues.map((cue) => cue.id)).toEqual([
      'cue-1',
      'cue-2',
      'cue-3',
      'cue-4',
    ]);
  });

  it('resumes at the last completed chunk and replaces only unfinished cues for direct videos', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          source: 'asr',
          languageCode: 'en',
          durationMs: 1800000,
          segments: [
            { id: 's', startMs: 901000, endMs: 902000, text: 'Next.' },
          ],
        }),
      });
    vi.stubGlobal('fetch', request);
    const ai = new VideosAiService();
    vi.spyOn(
      ai as unknown as {
        callGeminiStructured: (...args: unknown[]) => Promise<unknown>;
      },
      'callGeminiStructured',
    ).mockResolvedValue({
      cues: [{ id: 's', textEn: 'Next.', textVi: 'Tiếp theo.' }],
    });
    const cue = {
      id: 'cue-1',
      index: 1,
      startMs: 1000,
      endMs: 2000,
      textEn: 'First.',
      textVi: 'Đầu tiên.',
    };
    const result = await ai.generateSubtitles(
      parseVideoUrl('https://cdn.example.com/lesson.mp4')!,
      {
        startMs: 900000,
        durationMs: 1800000,
        cues: [cue, { ...cue, id: 'partial', startMs: 901000, endMs: 902000 }],
      },
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain('/video/transcript');
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      sourceUrl: 'https://cdn.example.com/lesson.mp4',
      startSeconds: 900,
      chunkSeconds: 900,
    });
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0]).toEqual(cue);
    expect(result.cues[1].textEn).toBe('Next.');
  });
  it('falls back to the fast text model when the primary provider is unavailable', async () => {
    vi.stubEnv('GEMINI_CHAT_MODEL', undefined);
    vi.stubEnv('GEMINI_ANALYSIS_MODEL', 'gemini-3.1-flash-lite');
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source: 'caption',
          languageCode: 'en',
          durationMs: 200000,
          segments: [
            { id: 'a', startMs: 120000, endMs: 120350, text: 'Hello.' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        body: { cancel: async () => {} },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cues: [
                        { id: 'a', textEn: 'Hello.', textVi: 'Xin chào.' },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', request);
    const result = await new VideosAiService().generateSubtitles(
      parseVideoUrl('https://youtu.be/jNQXAC9IVRw')!,
    );
    expect(request.mock.calls[1][0]).toContain(
      'gemini-3.1-flash-lite:generateContent',
    );
    expect(request.mock.calls[2][0]).toContain(
      'gemini-2.5-flash:generateContent',
    );
    expect(result.cues[0].startMs).toBe(120000);
    expect(result.cues[0].textVi).toBe('Xin chào.');
  });
  it('joins translations by ID without letting the model supply timestamps', async () => {
    const segments = [100000, 120000, 425000].map((startMs, index) => ({
      id: `s${index}`,
      startMs,
      endMs: startMs + 350,
      text: `Original ${index}.`,
    }));
    const ai = new VideosAiService();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        source: 'caption',
        languageCode: 'en',
        durationMs: 500000,
        segments,
      }),
    });
    vi.stubGlobal('fetch', fetch);
    const generate = vi
      .spyOn(
        ai as unknown as {
          callGeminiStructured: (...args: unknown[]) => Promise<unknown>;
        },
        'callGeminiStructured',
      )
      .mockResolvedValue({
        cues: [...segments].reverse().map((item) => ({
          id: item.id,
          textEn: item.text,
          textVi: 'Bản dịch.',
        })),
      });
    const result = await ai.generateSubtitles(
      parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!,
    );
    expect(result.cues.map((cue) => cue.startMs)).toEqual([
      100000, 120000, 425000,
    ]);
    expect(result.cues[0].endMs).toBe(100350);
    expect(result.durationMs).toBe(500000);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('rejects missing or duplicated translation IDs instead of shifting sentences', async () => {
    const ai = new VideosAiService();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          source: 'asr',
          languageCode: 'vi',
          durationMs: 10000,
          segments: [
            { id: 'a', startMs: 1000, endMs: 2000, text: 'Xin chào.' },
            { id: 'b', startMs: 3000, endMs: 4000, text: 'Tạm biệt.' },
          ],
        }),
      }),
    );
    vi.spyOn(
      ai as unknown as {
        callGeminiStructured: (...args: unknown[]) => Promise<unknown>;
      },
      'callGeminiStructured',
    ).mockResolvedValue({
      cues: [
        { id: 'a', textEn: 'Hi.', textVi: 'Xin chào.' },
        { id: 'a', textEn: 'Hi.', textVi: 'Xin chào.' },
      ],
    });
    await expect(
      ai.generateSubtitles(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')!),
    ).rejects.toThrow('duplicated');
  });
});
