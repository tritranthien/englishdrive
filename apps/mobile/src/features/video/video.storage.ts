import { NativeModules } from 'react-native';

type NativeStore = {
  read(userId: string, key: string): Promise<string | null>;
  write(userId: string, key: string, value: string): Promise<void>;
};

const native = NativeModules.ChatStorage as NativeStore | undefined;
const memory = new Map<string, string>();
const writes = new Map<string, Promise<void>>();

export type SubtitleOverlayStyle = {
  offsetX: number;
  offsetY: number;
  fontScale: number;
  bgOpacity: number;
  boxOpacity: number;
  maxWidthPercent: number;
};

export const DEFAULT_SUBTITLE_OVERLAY_STYLE: SubtitleOverlayStyle = {
  offsetX: 0,
  offsetY: 0,
  fontScale: 1,
  bgOpacity: 0.78,
  boxOpacity: 1,
  maxWidthPercent: 92,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeSubtitleOverlayStyle(
  raw?: Partial<SubtitleOverlayStyle> | null,
): SubtitleOverlayStyle {
  return {
    offsetX: Math.round(
      clamp(raw?.offsetX ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.offsetX, -600, 600),
    ),
    offsetY: Math.round(
      clamp(raw?.offsetY ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.offsetY, -600, 300),
    ),
    fontScale: Number(
      clamp(
        raw?.fontScale ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.fontScale,
        0.75,
        1.65,
      ).toFixed(2),
    ),
    bgOpacity: Number(
      clamp(
        raw?.bgOpacity ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.bgOpacity,
        0,
        0.95,
      ).toFixed(2),
    ),
    boxOpacity: Number(
      clamp(
        raw?.boxOpacity ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.boxOpacity,
        0.35,
        1,
      ).toFixed(2),
    ),
    maxWidthPercent: Math.round(
      clamp(
        raw?.maxWidthPercent ?? DEFAULT_SUBTITLE_OVERLAY_STYLE.maxWidthPercent,
        55,
        98,
      ),
    ),
  };
}

const STORAGE_KEY = 'video:subtitleOverlayStyle';

export const videoStorage = {
  async loadOverlayStyle(userId: string): Promise<SubtitleOverlayStyle> {
    try {
      const value = native
        ? await native.read(userId, STORAGE_KEY)
        : memory.get(`${userId}:${STORAGE_KEY}`);
      if (!value) return { ...DEFAULT_SUBTITLE_OVERLAY_STYLE };
      const parsed = JSON.parse(value) as Partial<SubtitleOverlayStyle>;
      return sanitizeSubtitleOverlayStyle(parsed);
    } catch {
      return { ...DEFAULT_SUBTITLE_OVERLAY_STYLE };
    }
  },

  async saveOverlayStyle(
    userId: string,
    style: SubtitleOverlayStyle,
  ): Promise<void> {
    const clean = sanitizeSubtitleOverlayStyle(style);
    const payload = JSON.stringify(clean);
    const task = (writes.get(userId) ?? Promise.resolve()).then(async () => {
      try {
        if (native) await native.write(userId, STORAGE_KEY, payload);
        else memory.set(`${userId}:${STORAGE_KEY}`, payload);
      } catch {
        memory.set(`${userId}:${STORAGE_KEY}`, payload);
      }
    });
    writes.set(userId, task);
    await task;
    if (writes.get(userId) === task) writes.delete(userId);
  },
};
