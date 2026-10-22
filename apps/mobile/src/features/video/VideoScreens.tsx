import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { AuthResult } from '../../api/client';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import {
  NativeVideoPlayer,
  type SubtitleDisplayMode,
} from './NativeVideoPlayer';
import {
  videoApi,
  type VideoLessonDetail,
  type VideoLessonSummary,
  type VideoSubtitleCue,
} from './video.api';
import {
  DEFAULT_SUBTITLE_OVERLAY_STYLE,
  sanitizeSubtitleOverlayStyle,
  videoStorage,
  type SubtitleOverlayStyle,
} from './video.storage';
import { videoStyles as s } from './video.styles';
import { VideoVocabularySheet } from './VideoVocabularySheet';
import { SubtitleSlider } from './SubtitleSlider';

export function formatVideoTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function findActiveCue(
  cues: VideoSubtitleCue[],
  currentTimeMs: number,
): VideoSubtitleCue | undefined {
  return cues.reduce<VideoSubtitleCue | undefined>(
    (active, cue) =>
      currentTimeMs >= cue.startMs &&
      currentTimeMs < cue.endMs &&
      (!active || cue.startMs >= active.startMs)
        ? cue
        : active,
    undefined,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Chưa thực hiện được yêu cầu. Hãy thử lại.';
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, primary && s.primaryButton, disabled && s.disabled]}
    >
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
}

export function VideoHomeScreen({
  auth,
  onOpenVideo,
}: {
  auth: AuthResult;
  onOpenVideo: (videoId: string, title?: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [items, setItems] = useState<VideoLessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const list = await videoApi.list(auth.accessToken);
      setItems(list);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const created = await videoApi.create(auth.accessToken, trimmed);
      setUrl('');
      void load();
      onOpenVideo(created.id, created.title);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeVideo(id: string) {
    try {
      await videoApi.remove(auth.accessToken, id);
      setItems(current => current.filter(item => item.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <ScrollView
      testID="screen-video"
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.card}>
        <Text style={s.title}>Xem video & Tạo phụ đề song ngữ AI</Text>
        <Text style={s.hint}>
          Dán link YouTube (youtube.com, youtu.be, Shorts) hoặc link file video
          trực tiếp (.mp4) để xem ngay trong ứng dụng và tự động tạo phụ đề Anh
          - Việt.
        </Text>
        <TextInput
          accessibilityLabel="Link video"
          placeholder="Dán link YouTube hoặc link .mp4 tại đây…"
          placeholderTextColor="#8596ad"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={s.input}
        />
        <ActionButton
          label={
            submitting
              ? 'Đang mở video & tạo phụ đề…'
              : 'Mở & Tạo phụ đề song ngữ'
          }
          primary
          disabled={submitting || !url.trim()}
          onPress={() => void submitUrl()}
        />
      </View>

      {error && (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      )}

      <View style={s.row}>
        <Text style={[s.title, s.grow]}>Video đã lưu</Text>
        <ActionButton label="Tải lại" onPress={() => void load()} />
      </View>

      {loading && !items.length && (
        <Text style={s.hint}>Đang tải danh sách video…</Text>
      )}

      {!loading && !items.length && (
        <View style={s.card}>
          <Text style={s.hint}>
            Chưa có video nào. Hãy dán một đường link video ở trên để bắt đầu
            học tiếng Anh qua phụ đề song ngữ!
          </Text>
        </View>
      )}

      {items.map(item => {
        const statusText =
          item.status === 'READY'
            ? `${item.subtitleCount} câu song ngữ`
            : item.status === 'PROCESSING'
              ? 'Đang tạo phụ đề AI…'
              : 'Chưa tạo được phụ đề';
        return (
          <View key={item.id} style={s.card}>
            <View style={s.row}>
              <View
                style={[
                  s.badge,
                  item.status === 'READY' && s.badgeReady,
                  item.status === 'FAILED' && s.badgeFailed,
                ]}
              >
                <Text style={s.badgeText}>
                  {item.sourceType === 'YOUTUBE' ? 'YouTube' : 'Video'} ·{' '}
                  {statusText}
                </Text>
              </View>
            </View>
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.hint} numberOfLines={1}>
              {item.url}
            </Text>
            {item.status === 'FAILED' && item.errorMessage && (
              <Text style={s.error}>{item.errorMessage}</Text>
            )}
            <View style={s.row}>
              <View style={s.grow}>
                <ActionButton
                  label="Xem video & phụ đề"
                  primary
                  onPress={() => onOpenVideo(item.id, item.title)}
                />
              </View>
              <ActionButton
                label="Xóa"
                onPress={() => void removeVideo(item.id)}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const DISPLAY_MODES: Array<{ key: SubtitleDisplayMode; label: string }> = [
  { key: 'BILINGUAL', label: 'Song ngữ' },
  { key: 'EN', label: 'Chỉ EN' },
  { key: 'VI', label: 'Chỉ VI' },
  { key: 'OFF', label: 'Ẩn trên video' },
];

const SAMPLE_PREVIEW_CUE: VideoSubtitleCue = {
  id: 'preview-cue',
  index: 0,
  startMs: 0,
  endMs: 5000,
  textEn: 'Drag subtitle or pull corner ◢ to resize.',
  textVi: 'Chạm kéo để đổi vị trí · Kéo góc ◢ để chỉnh kích thước.',
};

export function VideoPlayerScreen({
  auth,
  videoId,
  onSaveVocabulary,
  onFullscreenChange,
}: {
  auth: AuthResult;
  videoId: string;
  onSaveVocabulary: (words: VocabularyHighlight[]) => Promise<void>;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    onFullscreenChange?.(fullscreen);
    return () => onFullscreenChange?.(false);
  }, [fullscreen, onFullscreenChange]);
  useEffect(() => {
    if (!fullscreen) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => listener.remove();
  }, [fullscreen]);
  useFocusEffect(useCallback(() => () => setFullscreen(false), []));
  const [video, setVideo] = useState<VideoLessonDetail>();
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string>();
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [displayMode, setDisplayMode] =
    useState<SubtitleDisplayMode>('BILINGUAL');
  const [overlayStyle, setOverlayStyle] = useState<SubtitleOverlayStyle>(
    DEFAULT_SUBTITLE_OVERLAY_STYLE,
  );
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [seekRequest, setSeekRequest] = useState<string>();
  const [vocabularyCue, setVocabularyCue] = useState<VideoSubtitleCue>();
  const seekCounter = useRef(0);
  const overlayEdited = useRef(false);
  const [overlayLoaded, setOverlayLoaded] = useState(false);
  const loadedOverlayUser = useRef(auth.user.id);
  const latestOverlay = useRef({ style: overlayStyle, userId: auth.user.id });
  latestOverlay.current = { style: overlayStyle, userId: auth.user.id };
  useEffect(
    () => () => {
      if (overlayEdited.current)
        void videoStorage.saveOverlayStyle(
          latestOverlay.current.userId,
          latestOverlay.current.style,
        );
    },
    [],
  );
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cueOffsets = useRef<Record<string, number>>({});
  const lastScrolledCueId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (loadedOverlayUser.current !== auth.user.id) {
      overlayEdited.current = false;
      loadedOverlayUser.current = auth.user.id;
      setOverlayLoaded(false);
    }
    void videoStorage.loadOverlayStyle(auth.user.id).then(loaded => {
      if (!active) return;
      if (!overlayEdited.current) setOverlayStyle(loaded);
      setOverlayLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [auth.user.id]);
  useEffect(() => {
    if (!overlayLoaded || !overlayEdited.current) return;
    const timer = setTimeout(() => {
      void videoStorage.saveOverlayStyle(auth.user.id, overlayStyle);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [auth.user.id, overlayStyle, overlayLoaded]);

  const updateOverlayStyle = useCallback(
    (
      updater:
        | Partial<SubtitleOverlayStyle>
        | ((prev: SubtitleOverlayStyle) => Partial<SubtitleOverlayStyle>),
    ) => {
      overlayEdited.current = true;
      setOverlayStyle(prev => {
        const raw = typeof updater === 'function' ? updater(prev) : updater;
        const next = sanitizeSubtitleOverlayStyle({ ...prev, ...raw });
        return next;
      });
    },
    [],
  );

  const fetchDetail = useCallback(async () => {
    try {
      const detail = await videoApi.get(auth.accessToken, videoId);
      setVideo(detail);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken, videoId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!video || video.status !== 'PROCESSING') return;
    const timer = setInterval(() => {
      void fetchDetail();
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, [video, fetchDetail]);

  const cues = video?.subtitles ?? [];
  const activeCue = findActiveCue(cues, currentTimeMs);
  const displayedCue =
    activeCue ?? (isCustomizing ? (cues[0] ?? SAMPLE_PREVIEW_CUE) : undefined);

  useEffect(() => {
    if (
      isCustomizing ||
      !activeCue ||
      activeCue.id === lastScrolledCueId.current
    )
      return;
    lastScrolledCueId.current = activeCue.id;
    const y = cueOffsets.current[activeCue.id];
    if (y != null) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, y - 60),
        animated: true,
      });
    }
  }, [activeCue, isCustomizing]);

  function handleSeekToCue(cue: VideoSubtitleCue) {
    seekCounter.current += 1;
    setSeekRequest(`${cue.startMs}:${seekCounter.current}`);
  }

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    setError(undefined);
    try {
      const updated = await videoApi.retry(auth.accessToken, videoId);
      setVideo(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRetrying(false);
    }
  }

  if (loading && !video) {
    return (
      <View style={[s.container, s.content]}>
        <Text style={s.hint}>Đang mở video…</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {video && (
        <NativeVideoPlayer
          playerId={video.id}
          sourceUrl={video.url}
          sourceType={video.sourceType}
          externalId={video.externalId}
          seekRequest={seekRequest}
          activeCue={displayedCue}
          displayMode={displayMode}
          overlayStyle={overlayStyle}
          isCustomizing={isCustomizing}
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen(value => !value)}
          onChangeOverlayStyle={updateOverlayStyle}
          onProgress={({ currentTimeMs: nextTimeMs }) => {
            setCurrentTimeMs(nextTimeMs);
          }}
        />
      )}

      <View style={[s.toolbar, fullscreen && { display: 'none' }]}>
        <Text style={s.title} numberOfLines={1}>
          {video?.title ?? 'Video bài học'}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={[s.grow, fullscreen && { display: 'none' }]}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <View style={s.wrapRow}>
            {DISPLAY_MODES.map(mode => (
              <Pressable
                key={mode.key}
                accessibilityRole="button"
                accessibilityLabel={`Chế độ phụ đề ${mode.label}`}
                onPress={() => setDisplayMode(mode.key)}
                style={[s.chip, displayMode === mode.key && s.activeChip]}
              >
                <Text style={s.label}>{mode.label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tùy chỉnh phụ đề"
              onPress={() => setIsCustomizing(prev => !prev)}
              style={[s.chip, isCustomizing && s.activeChip]}
            >
              <Text style={s.label}>
                {isCustomizing ? 'Đóng tùy chỉnh' : 'Tùy chỉnh phụ đề'}
              </Text>
            </Pressable>
          </View>

          {isCustomizing && (
            <View style={s.stylePanel} testID="subtitle-style-panel">
              <SubtitleSlider
                label="Cỡ chữ phụ đề"
                value={overlayStyle.fontScale}
                min={0.75}
                max={1.65}
                step={0.05}
                onChange={fontScale => updateOverlayStyle({ fontScale })}
              />
              <SubtitleSlider
                label="Chiều rộng khung phụ đề"
                value={overlayStyle.maxWidthPercent / 100}
                min={0.55}
                max={0.98}
                step={0.01}
                onChange={width =>
                  updateOverlayStyle({
                    maxWidthPercent: Math.round(width * 100),
                  })
                }
              />
              <SubtitleSlider
                label="Độ mờ nền phụ đề"
                value={overlayStyle.bgOpacity}
                min={0}
                max={0.95}
                step={0.05}
                onChange={bgOpacity => updateOverlayStyle({ bgOpacity })}
              />
              <SubtitleSlider
                label="Độ rõ toàn bộ phụ đề"
                value={overlayStyle.boxOpacity}
                min={0.35}
                max={1}
                step={0.05}
                onChange={boxOpacity => updateOverlayStyle({ boxOpacity })}
              />
              <Text style={s.hint}>
                Mẹo: Chạm & kéo trực tiếp hộp phụ đề trên video để đổi vị trí,
                hoặc kéo góc ◢ để phóng to/thu nhỏ.
              </Text>

              <View style={s.controlRow}>
                <Text style={s.controlLabel}>Vị trí nhanh</Text>
                <View style={s.wrapRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đưa phụ đề lên trên"
                    onPress={() =>
                      updateOverlayStyle({ offsetX: 0, offsetY: -125 })
                    }
                    style={s.miniChip}
                  >
                    <Text style={s.label}>Mép trên</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đưa phụ đề ra giữa"
                    onPress={() =>
                      updateOverlayStyle({ offsetX: 0, offsetY: -65 })
                    }
                    style={s.miniChip}
                  >
                    <Text style={s.label}>Giữa</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đưa phụ đề xuống dưới"
                    onPress={() =>
                      updateOverlayStyle({ offsetX: 0, offsetY: 0 })
                    }
                    style={s.miniChip}
                  >
                    <Text style={s.label}>Mép dưới</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Đặt lại mặc định phụ đề"
                    onPress={() =>
                      updateOverlayStyle(DEFAULT_SUBTITLE_OVERLAY_STYLE)
                    }
                    style={s.miniChip}
                  >
                    <Text style={s.label}>Đặt lại</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>

        {error && (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            {error}
          </Text>
        )}

        {video?.status === 'PROCESSING' && (
          <View style={s.card}>
            <View style={s.row}>
              <ActivityIndicator color="#55ddb6" />
              <Text style={[s.title, s.grow]}>
                Đang tự động tạo phụ đề song ngữ (Anh - Việt)…
              </Text>
            </View>
            <Text style={s.hint}>
              Video được xử lý từng đoạn 15 phút. Phụ đề hiện dần, bạn có thể
              xem và học ngay khi từng phần hoàn tất.
            </Text>
            {!!video.totalChunks && (
              <Text accessibilityLiveRegion="polite" style={s.label}>
                Đã xử lý {video.completedChunks ?? 0}/{video.totalChunks} đoạn ·{' '}
                {formatVideoTimestamp(video.processedUntilMs ?? 0)} /{' '}
                {formatVideoTimestamp((video.durationSeconds ?? 0) * 1000)}
              </Text>
            )}
          </View>
        )}

        {video?.status === 'FAILED' && (
          <View style={s.card}>
            <Text style={s.error}>
              {video.errorMessage ??
                'Chưa tạo được phụ đề song ngữ cho video này.'}
            </Text>
            <ActionButton
              label={retrying ? 'Đang tạo lại phụ đề…' : 'Thử tạo lại phụ đề'}
              primary
              disabled={retrying}
              onPress={() => void handleRetry()}
            />
          </View>
        )}

        {video?.status === 'READY' && (
          <ActionButton
            label={retrying ? 'Đang tạo lại phụ đề…' : 'Tạo lại phụ đề'}
            disabled={retrying}
            onPress={() => void handleRetry()}
          />
        )}

        {cues.length > 0 && (
          <Text style={s.hint}>
            Chạm vào câu bất kỳ để tua video đến đoạn đó · Bấm "Tra & lưu từ" để
            lưu từ mới vào Sổ từ vựng.
          </Text>
        )}

        {cues.map(cue => {
          const isActive = activeCue?.id === cue.id;
          return (
            <Pressable
              key={cue.id}
              accessibilityRole="button"
              accessibilityLabel={`Phát câu phụ đề ${cue.index} lúc ${formatVideoTimestamp(cue.startMs)}`}
              onLayout={event => {
                cueOffsets.current[cue.id] = event.nativeEvent.layout.y;
              }}
              onPress={() => handleSeekToCue(cue)}
              style={[s.card, isActive && s.activeCueCard]}
            >
              <View style={s.row}>
                <Text style={[s.label, s.grow]}>
                  {formatVideoTimestamp(cue.startMs)} -{' '}
                  {formatVideoTimestamp(cue.endMs)}
                  {isActive ? ' · Đang phát' : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Tra từ câu ${cue.index}`}
                  onPress={() => setVocabularyCue(cue)}
                >
                  <Text style={s.label}>Tra & lưu từ</Text>
                </Pressable>
              </View>
              <Text style={s.subtitleEn}>{cue.textEn}</Text>
              <Text style={s.subtitleVi}>{cue.textVi}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {vocabularyCue && video && (
        <VideoVocabularySheet
          key={vocabularyCue.id}
          token={auth.accessToken}
          videoId={video.id}
          cue={vocabularyCue}
          onSave={onSaveVocabulary}
          onClose={() => setVocabularyCue(undefined)}
        />
      )}
    </View>
  );
}
