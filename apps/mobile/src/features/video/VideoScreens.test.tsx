import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler, DeviceEventEmitter, Text, TextInput } from 'react-native';
import { NativeVideoPlayer } from './NativeVideoPlayer';
import {
  findActiveCue,
  formatVideoTimestamp,
  VideoHomeScreen,
  VideoPlayerScreen,
} from './VideoScreens';
import { videoApi, type VideoLessonDetail } from './video.api';
import { SubtitleSlider } from './SubtitleSlider';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-navigation/native', () => {
  const mockReact = require('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockReact.useEffect(() => cb(), [cb]);
    },
  };
});

const auth = {
  accessToken: 'test-token',
  user: { id: 'u1', name: 'Learner', email: 'learner@example.com' },
};

const sampleDetail: VideoLessonDetail = {
  id: 'vid-1',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  sourceType: 'YOUTUBE',
  externalId: 'dQw4w9WgXcQ',
  title: 'Learn English Daily',
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  durationSeconds: 120,
  status: 'READY',
  errorMessage: null,
  subtitleCount: 2,
  createdAt: '2026-10-18T12:00:00.000Z',
  updatedAt: '2026-10-18T12:00:00.000Z',
  subtitles: [
    {
      id: 'cue-1',
      index: 1,
      startMs: 1000,
      endMs: 4000,
      textEn: 'Welcome to our English lesson.',
      textVi: 'Chào mừng đến với bài học tiếng Anh của chúng ta.',
    },
    {
      id: 'cue-2',
      index: 2,
      startMs: 4500,
      endMs: 8000,
      textEn: 'Let us practice speaking together.',
      textVi: 'Hãy cùng nhau luyện nói nhé.',
    },
  ],
};

describe('VideoScreens and subtitle helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows partial subtitles during processing and keeps the same player and cue in fullscreen', async () => {
    jest
      .spyOn(videoApi, 'get')
      .mockResolvedValue({
        ...sampleDetail,
        status: 'PROCESSING',
        durationSeconds: 3600,
        processedUntilMs: 900000,
        completedChunks: 1,
        totalChunks: 4,
      });
    const onFullscreenChange = jest.fn();
    let back: (() => boolean) | undefined;
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_name, callback) => {
        back = callback as () => boolean;
        return { remove: jest.fn() };
      });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <VideoPlayerScreen
            auth={auth}
            videoId="vid-1"
            onSaveVocabulary={jest.fn()}
            onFullscreenChange={onFullscreenChange}
          />,
        );
      });
      const player = renderer.root.findByType(NativeVideoPlayer);
      await act(async () => player.props.onProgress({ currentTimeMs: 2200 }));
      expect(
        renderer.root.findByType(NativeVideoPlayer).props.activeCue.id,
      ).toBe('cue-1');
      const text = renderer.root
        .findAllByType(Text)
        .map(node => React.Children.toArray(node.props.children).join(''))
        .join('\n');
      expect(text).toContain('1/4');
      expect(text).toContain('Welcome to our English lesson.');
      await act(async () => player.props.onToggleFullscreen());
      expect(renderer.root.findByType(NativeVideoPlayer)).toBe(player);
      expect(player.props.fullscreen).toBe(true);
      expect(player.props.activeCue.id).toBe('cue-1');
      expect(onFullscreenChange).toHaveBeenLastCalledWith(true);
      await act(async () => {
        expect(back?.()).toBe(true);
      });
      expect(player.props.fullscreen).toBe(false);
      expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
    }
  });

  it('formats timestamps and finds the active cue for current playback time', () => {
    expect(formatVideoTimestamp(0)).toBe('00:00');
    expect(formatVideoTimestamp(65400)).toBe('01:05');
    expect(findActiveCue(sampleDetail.subtitles, 2500)?.id).toBe('cue-1');
    expect(findActiveCue(sampleDetail.subtitles, 6000)?.id).toBe('cue-2');
    expect(findActiveCue(sampleDetail.subtitles, 500)).toBeUndefined();
    expect(findActiveCue(sampleDetail.subtitles, 4000)).toBeUndefined();
    expect(findActiveCue(sampleDetail.subtitles, 4100)).toBeUndefined();
    expect(findActiveCue(sampleDetail.subtitles, 4500)?.id).toBe('cue-2');
  });

  it('submits a pasted video URL and opens the player screen', async () => {
    jest.spyOn(videoApi, 'list').mockResolvedValue([]);
    const createSpy = jest
      .spyOn(videoApi, 'create')
      .mockResolvedValue(sampleDetail);
    const onOpenVideo = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <VideoHomeScreen auth={auth} onOpenVideo={onOpenVideo} />,
      );
    });

    const input = renderer.root.findByType(TextInput);
    await act(async () => {
      input.props.onChangeText('https://youtu.be/dQw4w9WgXcQ');
    });

    const submitBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Mở & Tạo phụ đề song ngữ' &&
        typeof node.props.onPress === 'function',
    )[0];

    await act(async () => {
      await submitBtn.props.onPress();
    });

    expect(createSpy).toHaveBeenCalledWith(
      'test-token',
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(onOpenVideo).toHaveBeenCalledWith('vid-1', 'Learn English Daily');
    await act(async () => renderer.unmount());
  });

  it('renders bilingual subtitles, syncs with playback time, and looks up/saves vocabulary', async () => {
    jest.spyOn(videoApi, 'get').mockResolvedValue(sampleDetail);
    const vocabSpy = jest.spyOn(videoApi, 'vocabulary').mockResolvedValue({
      term: 'English lesson',
      meaningVi: 'bài học tiếng Anh',
      pronunciation: '/ˈɪŋɡlɪʃ ˈlɛsən/',
      partOfSpeech: 'cụm danh từ',
      explanation: 'Buổi học tiếng Anh.',
      example: 'This English lesson is very helpful.',
    });
    const onSaveVocabulary = jest.fn().mockResolvedValue(undefined);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <VideoPlayerScreen
          auth={auth}
          videoId="vid-1"
          onSaveVocabulary={onSaveVocabulary}
        />,
      );
    });

    const allTexts = () =>
      renderer.root
        .findAllByType(Text)
        .map(n =>
          Array.isArray(n.props.children)
            ? n.props.children.join('')
            : String(n.props.children),
        );

    expect(allTexts()).toContain('Welcome to our English lesson.');
    expect(allTexts()).toContain(
      'Chào mừng đến với bài học tiếng Anh của chúng ta.',
    );

    await act(async () => {
      DeviceEventEmitter.emit('videoPlayerProgress', {
        playerId: 'vid-1',
        currentTimeMs: 2200,
        durationMs: 120000,
        isPlaying: true,
      });
    });

    expect(allTexts().some(t => t.includes('Đang phát'))).toBe(true);

    const lookupBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Tra từ câu 1' &&
        typeof node.props.onPress === 'function',
    )[0];

    await act(async () => {
      lookupBtn.props.onPress();
    });

    const word4 = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Chọn từ English (4)' &&
        typeof node.props.onPress === 'function',
    )[0];
    const word5 = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Chọn từ lesson (5)' &&
        typeof node.props.onPress === 'function',
    )[0];

    await act(async () => {
      word4.props.onPress();
    });
    await act(async () => {
      word5.props.onPress();
    });

    const traNghiaBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Tra nghĩa' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      await traNghiaBtn.props.onPress();
    });

    expect(vocabSpy).toHaveBeenCalledWith(
      'test-token',
      'vid-1',
      'cue-1',
      15,
      29,
    );

    const saveBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Lưu vào từ vựng' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      await saveBtn.props.onPress();
    });

    expect(onSaveVocabulary).toHaveBeenCalledWith([
      {
        term: 'English lesson',
        meaningVi: 'bài học tiếng Anh',
        example: 'This English lesson is very helpful.',
      },
    ]);
    await act(async () => renderer.unmount());
  });

  it('allows customizing subtitle font size, background opacity, and position on video frame', async () => {
    jest.spyOn(videoApi, 'get').mockResolvedValue(sampleDetail);
    const onSaveVocabulary = jest.fn().mockResolvedValue(undefined);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <VideoPlayerScreen
          auth={auth}
          videoId="vid-1"
          onSaveVocabulary={onSaveVocabulary}
        />,
      );
    });

    const customizeBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Tùy chỉnh phụ đề' &&
        typeof node.props.onPress === 'function',
    )[0];

    await act(async () => {
      customizeBtn.props.onPress();
    });

    const overlayBox = () =>
      renderer.root.findByProps({ testID: 'subtitle-overlay-box' });
    expect(overlayBox()).toBeTruthy();

    const fontSlider = renderer.root
      .findAllByType(SubtitleSlider)
      .find(node => node.props.label === 'Cỡ chữ phụ đề')!;
    await act(async () => {
      fontSlider.props.onChange(1.4);
    });

    const backgroundSlider = renderer.root
      .findAllByType(SubtitleSlider)
      .find(node => node.props.label === 'Độ mờ nền phụ đề')!;
    await act(async () => {
      backgroundSlider.props.onChange(0);
    });

    const topPosBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Đưa phụ đề lên trên' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      topPosBtn.props.onPress();
    });

    const flatStyle = Object.assign(
      {},
      ...(overlayBox().props.style as Array<Record<string, unknown>>).filter(
        Boolean,
      ),
    );
    expect(flatStyle.backgroundColor).toBe('rgba(5, 12, 22, 0)');
    expect(flatStyle.transform).toEqual([
      { translateX: 0 },
      { translateY: -118 },
    ]);

    const resetBtn = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === 'Đặt lại mặc định phụ đề' &&
        typeof node.props.onPress === 'function',
    )[0];
    await act(async () => {
      resetBtn.props.onPress();
    });

    const resetStyle = Object.assign(
      {},
      ...(overlayBox().props.style as Array<Record<string, unknown>>).filter(
        Boolean,
      ),
    );
    expect(resetStyle.backgroundColor).toBe('rgba(5, 12, 22, 0.78)');
    expect(resetStyle.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
    ]);

    await act(async () => renderer.unmount());
  });
});
