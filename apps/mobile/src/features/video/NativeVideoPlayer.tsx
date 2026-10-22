import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DeviceEventEmitter,
  PanResponder,
  Platform,
  Pressable,
  requireNativeComponent,
  Text,
  UIManager,
  View,
  type ViewProps,
} from 'react-native';
import type { VideoSourceType, VideoSubtitleCue } from './video.api';
import {
  DEFAULT_SUBTITLE_OVERLAY_STYLE,
  sanitizeSubtitleOverlayStyle,
  type SubtitleOverlayStyle,
} from './video.storage';
import { videoStyles as s } from './video.styles';

export type SubtitleDisplayMode = 'BILINGUAL' | 'EN' | 'VI' | 'OFF';

type NativePlayerProps = ViewProps & {
  playerId: string;
  sourceUrl: string;
  sourceType: VideoSourceType;
  externalId?: string;
  seekRequest?: string;
  fullscreen?: boolean;
};

const COMPONENT_NAME = 'EnglishDriveVideoPlayer';
const hasNativePlayer =
  Platform.OS === 'android' &&
  typeof UIManager.getViewManagerConfig === 'function' &&
  UIManager.getViewManagerConfig(COMPONENT_NAME) != null;

const RCTVideoPlayer = hasNativePlayer
  ? requireNativeComponent<NativePlayerProps>(COMPONENT_NAME)
  : null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function NativeVideoPlayer({
  playerId,
  sourceUrl,
  sourceType,
  externalId,
  seekRequest,
  activeCue,
  displayMode,
  overlayStyle = DEFAULT_SUBTITLE_OVERLAY_STYLE,
  isCustomizing = false,
  onChangeOverlayStyle,
  onProgress,
  fullscreen = false,
  onToggleFullscreen,
}: {
  playerId: string;
  sourceUrl: string;
  sourceType: VideoSourceType;
  externalId?: string | null;
  seekRequest?: string;
  activeCue?: VideoSubtitleCue;
  displayMode: SubtitleDisplayMode;
  overlayStyle?: SubtitleOverlayStyle;
  isCustomizing?: boolean;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onChangeOverlayStyle?: (next: SubtitleOverlayStyle) => void;
  onProgress: (progress: {
    currentTimeMs: number;
    durationMs: number;
    isPlaying: boolean;
  }) => void;
}) {
  const [playerSize, setPlayerSize] = useState({ width: 360, height: 202 });
  const [boxSize, setBoxSize] = useState({ width: 300, height: 60 });
  const boxRef = useRef(boxSize);
  boxRef.current = boxSize;
  const styleRef = useRef<SubtitleOverlayStyle>(overlayStyle);
  styleRef.current = overlayStyle;

  const callbackRef = useRef(onChangeOverlayStyle);
  callbackRef.current = onChangeOverlayStyle;
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const sizeRef = useRef(playerSize);
  sizeRef.current = playerSize;

  const dragOriginRef = useRef({ x: 0, y: 0 });
  const resizeOriginRef = useRef({ fontScale: 1, maxWidthPercent: 92 });

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'videoPlayerProgress',
      (event: {
        playerId?: string;
        currentTimeMs?: number;
        durationMs?: number;
        isPlaying?: boolean;
      }) => {
        if (event?.playerId !== playerId) return;
        progressRef.current({
          currentTimeMs: Math.max(0, Math.round(event.currentTimeMs ?? 0)),
          durationMs: Math.max(0, Math.round(event.durationMs ?? 0)),
          isPlaying: Boolean(event.isPlaying),
        });
      },
    );
    return () => {
      sub.remove();
    };
  }, [playerId]);

  const dragPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          dragOriginRef.current = {
            x: styleRef.current.offsetX,
            y: styleRef.current.offsetY,
          };
        },
        onPanResponderMove: (_, gesture) => {
          if (!callbackRef.current) return;
          const maxOffsetX = Math.max(
            0,
            (sizeRef.current.width - 12 - boxRef.current.width) / 2,
          );
          const minOffsetY =
            boxRef.current.height + 24 - sizeRef.current.height;
          const maxOffsetY = 24;
          const next = sanitizeSubtitleOverlayStyle({
            ...styleRef.current,
            offsetX: clamp(
              dragOriginRef.current.x + gesture.dx,
              -maxOffsetX,
              maxOffsetX,
            ),
            offsetY: clamp(
              dragOriginRef.current.y + gesture.dy,
              minOffsetY,
              maxOffsetY,
            ),
          });
          callbackRef.current(next);
        },
      }),
    [],
  );

  const resizePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          resizeOriginRef.current = {
            fontScale: styleRef.current.fontScale,
            maxWidthPercent: styleRef.current.maxWidthPercent,
          };
        },
        onPanResponderMove: (_, gesture) => {
          if (!callbackRef.current) return;
          const widthDeltaPercent = Math.round(
            (gesture.dx / Math.max(180, sizeRef.current.width)) * 100,
          );
          const scaleDelta = (gesture.dx + gesture.dy) / 180;
          const next = sanitizeSubtitleOverlayStyle({
            ...styleRef.current,
            maxWidthPercent: clamp(
              resizeOriginRef.current.maxWidthPercent + widthDeltaPercent,
              55,
              98,
            ),
            fontScale: clamp(
              resizeOriginRef.current.fontScale + scaleDelta,
              0.75,
              1.65,
            ),
          });
          callbackRef.current(next);
        },
      }),
    [],
  );

  const enFontSize = Math.round(14 * overlayStyle.fontScale);
  const viFontSize = Math.round(13 * overlayStyle.fontScale);

  return (
    <View
      style={[s.playerWrapper, fullscreen && s.fullscreenPlayer]}
      testID="video-player-wrapper"
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setPlayerSize({ width, height });
        }
      }}
    >
      {RCTVideoPlayer ? (
        <RCTVideoPlayer
          style={s.nativePlayer}
          playerId={playerId}
          sourceUrl={sourceUrl}
          sourceType={sourceType}
          externalId={externalId ?? ''}
          seekRequest={seekRequest}
          fullscreen={fullscreen}
        />
      ) : (
        <View
          style={[
            s.nativePlayer,
            { alignItems: 'center', justifyContent: 'center', padding: 12 },
          ]}
          accessibilityLabel={`Khung phát video ${sourceUrl}`}
        >
          <Text style={s.hint} numberOfLines={2}>
            Đang phát: {sourceUrl}
          </Text>
        </View>
      )}
      {onToggleFullscreen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fullscreen ? 'Thu nhỏ video' : 'Phóng lớn video'}
          onPress={onToggleFullscreen}
          style={s.fullscreenButton}
        >
          <Text style={s.label}>
            {fullscreen ? 'Thu nhỏ ↙' : 'Phóng lớn ⛶'}
          </Text>
        </Pressable>
      )}
      {activeCue && displayMode !== 'OFF' && (
        <View pointerEvents="box-none" style={s.overlayContainer}>
          <View
            testID="subtitle-overlay-box"
            accessibilityLabel="Khung phụ đề trên video (chạm và kéo để đổi vị trí)"
            {...dragPanResponder.panHandlers}
            onLayout={event => {
              const { width, height } = event.nativeEvent.layout;
              setBoxSize(previous =>
                previous.width === width && previous.height === height
                  ? previous
                  : { width, height },
              );
            }}
            style={[
              s.overlayBox,
              isCustomizing && s.overlayBoxEditing,
              {
                backgroundColor: `rgba(5, 12, 22, ${overlayStyle.bgOpacity})`,
                opacity: overlayStyle.boxOpacity,
                width: `${overlayStyle.maxWidthPercent}%`,
                maxHeight: playerSize.height,
                transform: [
                  {
                    translateX: clamp(
                      overlayStyle.offsetX,
                      -Math.max(0, (playerSize.width - 12 - boxSize.width) / 2),
                      Math.max(0, (playerSize.width - 12 - boxSize.width) / 2),
                    ),
                  },
                  {
                    translateY: clamp(
                      overlayStyle.offsetY,
                      boxSize.height + 24 - playerSize.height,
                      24,
                    ),
                  },
                ],
              },
            ]}
          >
            {(displayMode === 'BILINGUAL' || displayMode === 'EN') && (
              <Text
                style={[
                  s.overlayEn,
                  {
                    fontSize: enFontSize,
                    lineHeight: Math.round(enFontSize * 1.35),
                  },
                ]}
              >
                {activeCue.textEn}
              </Text>
            )}
            {(displayMode === 'BILINGUAL' || displayMode === 'VI') && (
              <Text
                style={[
                  s.overlayVi,
                  {
                    fontSize: viFontSize,
                    lineHeight: Math.round(viFontSize * 1.35),
                  },
                ]}
              >
                {activeCue.textVi}
              </Text>
            )}
            <View
              testID="subtitle-resize-handle"
              accessibilityLabel="Kéo góc để thay đổi kích thước phụ đề"
              {...resizePanResponder.panHandlers}
              style={s.resizeHandle}
            >
              <Text style={s.resizeHandleText}>◢</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
