import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler, Text, TextInput } from 'react-native';
import App from '../App';
import { authSession } from '../src/native/auth-session';
import { useLiveConversation } from '../src/features/live-conversation/hooks/useLiveConversation';
import { useSpeakerVerification } from '../src/features/speaker-verification/useSpeakerVerification';
import { useVocabulary } from '../src/features/vocabulary/useVocabulary';
import { useVocabularyDecks } from '../src/features/vocabulary/useVocabularyDecks';
import { chatApi, type ChatThread } from '../src/features/chat/chat.api';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/native/auth-session', () => ({
  authSession: { restore: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));
jest.mock('../src/features/live-conversation/hooks/useLiveConversation');
jest.mock('../src/features/speaker-verification/useSpeakerVerification');
jest.mock('../src/features/vocabulary/useVocabulary');
jest.mock('../src/features/vocabulary/useVocabularyDecks');
const mockChatState = {
  threads: [] as ChatThread[],
  pending: [],
  loading: false,
  unread: 0,
  refresh: jest.fn(async () => {}),
  send: jest.fn(async () => {}),
};
jest.mock('../src/features/chat/useChat', () => ({
  useChat: () => mockChatState,
}));
jest.mock('react-native-webrtc', () => ({}));

const labels = {
  conversation: 'Hội thoại',
  messages: 'Tin nhắn',
  vocabulary: 'Từ vựng',
  settings: 'Cài đặt',
};
let renderer: ReactTestRenderer.ReactTestRenderer;
let backHandlers: Array<() => boolean | null | undefined>;
let realtime: ReturnType<typeof useLiveConversation>;
let vocabulary: ReturnType<typeof useVocabulary>;
let speaker: ReturnType<typeof useSpeakerVerification>;
let decks: ReturnType<typeof useVocabularyDecks>;

function button(label: string) {
  const result = renderer.root.findAll(
    node =>
      (node.props.accessibilityLabel ?? node.props['aria-label']) === label &&
      typeof node.props.onPress === 'function',
  )[0];
  expect(result).toBeDefined();
  return result;
}
function selected(name: keyof typeof labels) {
  const props = renderer.root.findAll(
    node =>
      (node.props.accessibilityLabel ?? node.props['aria-label']) ===
        labels[name] &&
      (node.props['aria-selected'] != null ||
        node.props.accessibilityState?.selected != null),
  )[0].props;
  return props['aria-selected'] ?? props.accessibilityState?.selected;
}
function screen(name: keyof typeof labels) {
  return renderer.root.findAll(
    node =>
      node.props.testID ===
      (name === 'vocabulary' ? 'vocabulary-list' : `screen-${name}`),
  )[0];
}
async function press(label: string) {
  await act(async () => button(label).props.onPress());
  await act(async () => jest.runAllTimers());
}
async function select(name: keyof typeof labels) {
  await press(labels[name]);
}
function texts(node: ReactTestRenderer.ReactTestInstance) {
  return node.findAllByType(Text).map(text => text.props.children);
}
function settingsNavigation() {
  return renderer.root.findAll(
    node =>
      node.props.route?.name === 'SettingsHome' &&
      node.props.navigation?.getState,
  )[0].props.navigation;
}
function hardwareBack() {
  return [...backHandlers].reverse().some(handler => handler() === true);
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  backHandlers = [];
  jest.mocked(authSession.restore).mockResolvedValue({
    accessToken: 'token',
    user: { id: '1', name: 'Learner', email: 'learner@example.com' },
  });
  jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      const callback = () => handler({} as never);
      backHandlers.push(callback);
      return {
        remove: () => {
          backHandlers = backHandlers.filter(item => item !== callback);
        },
      };
    });
  realtime = {
    status: 'listening',
    isActive: true,
    userTranscript: 'Still talking',
    assistantTranscript: '',
    history: [],
    audioRoute: { type: 'phone', name: 'Phone' },
    start: jest.fn(),
    stop: jest.fn(),
    retryAnalysis: jest.fn(),
  } as unknown as ReturnType<typeof useLiveConversation>;
  vocabulary = {
    items: [
      {
        key: 'commute',
        term: 'commute',
        meaningVi: 'Travel to work',
        savedAt: 1,
        updatedAt: 1,
      },
    ],
    error: undefined,
    loading: false,
    saving: false,
    save: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
    capture: jest.fn(),
    move: jest.fn().mockResolvedValue(undefined),
  };
  decks = {
    items: [
      {
        id: 'work-deck',
        name: 'Công việc',
        wordCount: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    loading: false,
    saving: false,
    error: undefined,
    create: jest.fn(),
    rename: jest.fn(),
    remove: jest.fn(),
    reload: jest.fn().mockResolvedValue(undefined),
  };
  speaker = {
    refresh: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useSpeakerVerification>;
  jest.mocked(useLiveConversation).mockImplementation(() => realtime);
  jest.mocked(useVocabulary).mockImplementation(() => vocabulary);
  jest.mocked(useVocabularyDecks).mockImplementation(() => decks);
  jest.mocked(useSpeakerVerification).mockImplementation(() => speaker);
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('native navigators separate screens and keep an active call when switching tabs', async () => {
  expect(selected('conversation')).toBe(true);
  expect(texts(screen('conversation'))).toContain('Still talking');
  expect(screen('vocabulary')).toBeUndefined();
  await select('vocabulary');
  const home = renderer.root.findAll(
    node => node.props.testID === 'vocabulary-decks',
  )[0];
  expect(texts(home)).toContain('Chưa phân loại');
  expect(texts(home)).toContain('Công việc');
  expect(texts(home)).not.toContain('commute');
  await press('Mở bộ Chưa phân loại');
  expect(texts(screen('vocabulary'))).toContain('commute');
  expect(vocabulary.reload).toHaveBeenCalledTimes(2);
  expect(selected('vocabulary')).toBe(true);
  await select('settings');
  expect(texts(screen('settings'))).toContain('Hey English Drive');
  expect(realtime.stop).not.toHaveBeenCalled();
  expect(realtime.start).not.toHaveBeenCalled();
  await select('conversation');
  expect(texts(screen('conversation'))).toContain('Still talking');
});

test('keeps search and the add-word draft across native tab switches, and reloads on focus', async () => {
  await select('vocabulary');
  await press('Mở bộ Chưa phân loại');
  await act(async () =>
    screen('vocabulary')
      .findAllByType(TextInput)[0]
      .props.onChangeText('commute'),
  );
  await press('Thêm từ');
  const term = () =>
    screen('vocabulary')
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === 'Từ hoặc cụm từ')!;
  await act(async () => term().props.onChangeText('journey'));
  await select('settings');
  await select('vocabulary');
  expect(screen('vocabulary').findAllByType(TextInput)[0].props.value).toBe(
    'commute',
  );
  expect(term().props.value).toBe('journey');
  expect(vocabulary.reload).toHaveBeenCalledTimes(3);
});

test('creates a named deck and adds words directly inside it', async () => {
  jest.mocked(decks.create).mockImplementation(async name => {
    const deck = {
      id: 'new-deck',
      name,
      wordCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    decks = { ...decks, items: [...decks.items, deck] };
    renderer.update(<App />);
    return deck;
  });
  await select('vocabulary');
  await press('Tạo bộ từ vựng');
  await act(async () =>
    renderer.root
      .findAllByType(TextInput)
      .find(input => input.props.accessibilityLabel === 'Tên bộ từ vựng')!
      .props.onChangeText('Du lịch'),
  );
  await press('Lưu bộ từ vựng');
  expect(decks.create).toHaveBeenCalledWith('Du lịch');
  expect(texts(screen('vocabulary'))).not.toContain('commute');
  await press('Thêm từ');
  await act(async () => {
    const inputs = screen('vocabulary').findAllByType(TextInput);
    inputs
      .find(input => input.props.accessibilityLabel === 'Từ hoặc cụm từ')!
      .props.onChangeText('airport');
    inputs
      .find(input => input.props.accessibilityLabel === 'Nghĩa tiếng Việt')!
      .props.onChangeText('sân bay');
  });
  await press('Lưu từ');
  expect(vocabulary.save).toHaveBeenCalledWith(
    [{ term: 'airport', meaningVi: 'sân bay', example: '' }],
    'new-deck',
  );
});

test('selects words and moves them from Unclassified into a named deck', async () => {
  jest.mocked(vocabulary.move).mockImplementation(async (keys, deckId) => {
    vocabulary = {
      ...vocabulary,
      items: vocabulary.items.map(word =>
        keys.includes(word.key) ? { ...word, deckId } : word,
      ),
    };
    renderer.update(<App />);
  });
  await select('vocabulary');
  await press('Mở bộ Chưa phân loại');
  await press('Chọn từ');
  await press('Chọn từ commute');
  await press('Chuyển từ sang bộ');
  await press('Chuyển vào bộ Công việc');
  expect(vocabulary.move).toHaveBeenCalledWith(['commute'], 'work-deck');
  expect(texts(screen('vocabulary'))).not.toContain('commute');
  await act(async () => {
    expect(hardwareBack()).toBe(true);
  });
  await press('Mở bộ Công việc');
  expect(texts(screen('vocabulary'))).toContain('commute');
});

test('opens settings details in a stack and Android Back pops details before returning to conversation', async () => {
  await select('settings');
  await press('Hey English Drive');
  expect(settingsNavigation().getState().routes.at(-1).name).toBe(
    'AssistantSettings',
  );
  expect(
    renderer.root.findAll(
      node => node.props.testID === 'screen-assistant-settings',
    ).length,
  ).toBeGreaterThan(0);
  await act(async () => {
    expect(hardwareBack()).toBe(true);
  });
  expect(settingsNavigation().getState().routes.at(-1).name).toBe(
    'SettingsHome',
  );
  await act(async () => {
    expect(hardwareBack()).toBe(true);
  });
  expect(selected('conversation')).toBe(true);
  expect(hardwareBack()).toBe(false);
  expect(realtime.stop).not.toHaveBeenCalled();
});

test('enrollment prevents tab changes and leaving the native voice settings screen', async () => {
  await select('settings');
  await press('Bộ lọc giọng nói');
  speaker = {
    ...speaker,
    status: { enrolling: true, configured: false },
  } as ReturnType<typeof useSpeakerVerification>;
  await act(async () => renderer.update(<App />));
  await select('conversation');
  expect(selected('settings')).toBe(true);
  await act(async () => {
    expect(hardwareBack()).toBe(true);
  });
  expect(settingsNavigation().getState().routes.at(-1).name).toBe(
    'VoiceSettings',
  );
  await act(async () => settingsNavigation().goBack());
  expect(settingsNavigation().getState().routes.at(-1).name).toBe(
    'VoiceSettings',
  );
  speaker = { ...speaker, status: undefined };
  await act(async () => renderer.update(<App />));
  await act(async () => settingsNavigation().goBack());
  expect(settingsNavigation().getState().routes.at(-1).name).toBe(
    'SettingsHome',
  );
  await select('conversation');
  expect(selected('conversation')).toBe(true);
});

test('changing the conversation mode in its own screen updates the settings summary', async () => {
  realtime = { ...realtime, isActive: false, status: 'idle' };
  await act(async () => renderer.update(<App />));
  await select('settings');
  await press('Chế độ hội thoại');
  await press('Cuộc sống hằng ngày');
  await act(async () => settingsNavigation().goBack());
  expect(texts(screen('settings'))).toContain('Cuộc sống hằng ngày');
});

test('opens the messaging tab and group editor without interrupting a live call', async () => {
  await select('messages');
  expect(selected('messages')).toBe(true);
  expect(texts(screen('messages'))).toContain(
    'Làm quen với người bạn đầu tiên',
  );
  await press('Tạo nhóm');
  expect(
    renderer.root
      .findAllByType(Text)
      .some(node => node.props.children === 'Chọn 2–6 người bạn'),
  ).toBe(true);
  expect(realtime.stop).not.toHaveBeenCalled();
  await select('conversation');
  expect(texts(screen('conversation'))).toContain('Still talking');
});

test.each([false, true])(
  'returns to the inbox from a conversation, including a cold notification route (%s)',
  async cold => {
    const thread = {
      id: 'thread',
      title: 'Mai',
      kind: 'DIRECT',
      members: [],
      updatedAt: new Date().toISOString(),
    } as unknown as ChatThread;
    mockChatState.threads = [thread];
    jest.spyOn(chatApi, 'messages').mockResolvedValue({
      items: [],
      thread,
      replyStatus: 'IDLE',
      replyError: null,
      hasMore: false,
    });
    try {
      await select('messages');
      if (cold) {
        const navigation = renderer.root.findAll(
          node =>
            node.props.route?.name === 'MessagesHome' &&
            node.props.navigation?.reset,
        )[0].props.navigation;
        await act(async () =>
          navigation.reset({
            index: 0,
            routes: [{ name: 'ChatThread', params: { threadId: 'thread' } }],
          }),
        );
      } else {
        await act(async () => button('Mở chat Mai').props.onPress());
      }
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await act(async () => button('‹ Danh sách chat').props.onPress());
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen('messages')).toBeDefined();
      expect(button('Mở chat Mai')).toBeDefined();
    } finally {
      mockChatState.threads = [];
    }
  },
);
