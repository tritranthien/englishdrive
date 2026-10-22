import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import {
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  DeviceEventEmitter,
  StyleSheet,
  TextInput,
  Text,
  View,
} from 'react-native';
import {
  ChatThreadScreen,
  CharacterEditorScreen,
  mergeMessages,
} from './ChatScreens';
import { chatApi, type ChatMessage, type ChatThread } from './chat.api';
import { chatStorage } from './chat.storage';
import type { ChatSession } from './useChat';
import { ChatWordPopup } from './ChatWordPopup';
import { ChatMessageText } from './ChatMessageText';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 80 }));
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('./chat.api', () => ({
  chatApi: {
    messages: jest.fn(),
    read: jest.fn(),
    help: jest.fn(),
    typing: jest.fn(async () => ({})),
    addCharacter: jest.fn(),
  },
}));
const auth = {
  user: { id: 'screen-user', name: 'Test', email: 'test@example.com' },
  accessToken: 'token',
};
const thread = {
  id: 'thread',
  title: 'Mai',
  kind: 'DIRECT',
  romance: false,
  members: [
    { characterId: 'mai', character: { name: 'Mai', color: '#55ddb6' } },
  ],
} as ChatThread;
const message = {
  id: 'message',
  threadId: 'thread',
  sequence: 1,
  role: 'CHARACTER',
  content: 'How was your day?',
  characterId: 'mai',
  createdAt: '2026-10-17T12:00:00Z',
  clientMessageId: null,
} as ChatMessage;

it('merges incremental pages without duplicating or reversing messages', () => {
  const second = { ...message, id: 'second', sequence: 2 };
  expect(mergeMessages([second], [message, second]).map(m => m.id)).toEqual([
    'message',
    'second',
  ]);
});
it('keeps the composer above the keyboard as the tab bar hides and restores the layout on dismissal', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  (chatApi.messages as jest.Mock).mockResolvedValue({
    items: [],
    thread,
    replyStatus: 'IDLE',
    hasMore: false,
  });
  const chat = {
    pending: [],
    refresh: jest.fn(async () => {}),
  } as unknown as ChatSession;
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(
      <ChatThreadScreen
        auth={auth}
        threadId="thread"
        chat={chat}
        onSettings={jest.fn()}
        onBack={jest.fn()}
        onSaveVocabulary={jest.fn()}
      />,
    );
  });
  const avoiding = root.root.findByType(KeyboardAvoidingView);
  const layout = async (height: number) => {
    await act(async () => {
      await avoiding.findByType(View).props.onLayout({
        persist: jest.fn(),
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height } },
      });
    });
  };
  const style = () => StyleSheet.flatten(avoiding.findByType(View).props.style);
  await layout(700);
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidShow', {
      endCoordinates: { screenY: 500, screenX: 0, width: 400, height: 300 },
      duration: 0,
      easing: 'keyboard',
    });
  });
  expect(Keyboard.isVisible()).toBe(true);
  expect(style().paddingBottom).toBe(280);
  // Hiding the bottom tab bar gives the screen another 64 points of space.
  await layout(764);
  expect(style().paddingBottom).toBe(344);
  expect(style().flex).toBe(1);
  await act(async () => {
    DeviceEventEmitter.emit('keyboardDidHide', {});
  });
  await layout(700);
  expect(style().paddingBottom).toBe(0);
  await act(async () => root.unmount());
  platform.restore();
});
it('shows sender and translation controls and puts suggestions into the draft without sending', async () => {
  (chatApi.messages as jest.Mock).mockResolvedValue({
    items: [message],
    thread,
    replyStatus: 'IDLE',
    hasMore: false,
  });
  (chatApi.read as jest.Mock).mockResolvedValue({});
  (chatApi.help as jest.Mock).mockResolvedValue({
    text: 'My day was great, thanks!',
  });
  const chat = {
    pending: [],
    refresh: jest.fn(async () => {}),
    send: jest.fn(async () => {}),
  } as unknown as ChatSession;
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(
      <ChatThreadScreen
        auth={auth}
        threadId="thread"
        chat={chat}
        onSettings={jest.fn()}
        onBack={jest.fn()}
        onSaveVocabulary={jest.fn()}
      />,
    );
  });
  const texts = root.root
    .findAllByType(Text)
    .map(n => React.Children.toArray(n.props.children).join(''))
    .join('\n');
  expect(texts).toContain('Mai');
  expect(root.root.findByType(ChatMessageText).props.content).toBe(
    'How was your day?',
  );
  await act(async () =>
    root.root
      .findByType(ChatMessageText)
      .props.onSelect({ start: 0, end: 3, x: 20, y: 100 }),
  );
  expect(root.root.findByType(ChatWordPopup).props.message).toEqual(message);
  await act(async () =>
    root.root.findByType(ChatWordPopup).props.onChoosePhrase(),
  );
  expect(root.root.findByType(ChatMessageText).props.choosingPhrase).toBe(true);
  expect(root.root.findAllByType(ChatWordPopup)).toHaveLength(0);
  await act(async () =>
    root.root
      .findByType(ChatMessageText)
      .props.onSelect({ start: 13, end: 16, x: 80, y: 100 }),
  );
  expect(root.root.findByType(ChatWordPopup).props.selection).toEqual({
    start: 0,
    end: 16,
    x: 80,
    y: 100,
  });
  await act(async () =>
    root.root.findByType(ChatWordPopup).props.onChoosePhrase(),
  );
  await act(async () =>
    root.root
      .findAllByProps({ accessibilityLabel: 'Hủy chọn cụm' })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress(),
  );
  expect(root.root.findByType(ChatMessageText).props.choosingPhrase).toBe(
    false,
  );
  expect(root.root.findByType(ChatMessageText).props.selected).toBeUndefined();
  await act(async () =>
    root.root
      .findByType(ChatMessageText)
      .props.onSelect({ start: 13, end: 16, x: 80, y: 100 }),
  );
  await act(async () =>
    root.root.findByType(ChatWordPopup).props.onChoosePhrase(),
  );
  await act(async () =>
    root.root
      .findByType(ChatMessageText)
      .props.onSelect({ start: 0, end: 3, x: 20, y: 100 }),
  );
  expect(root.root.findByType(ChatWordPopup).props.selection).toEqual({
    start: 0,
    end: 16,
    x: 20,
    y: 100,
  });
  await act(async () => root.root.findByType(ChatWordPopup).props.onClose());
  await act(async () =>
    root.root
      .findByProps({
        accessibilityLabel: 'Gợi ý trả lời',
        accessibilityRole: 'button',
      })
      .props.onPress(),
  );
  expect(root.root.findByType(TextInput).props.value).toBe(
    'My day was great, thanks!',
  );
  expect(chat.send).not.toHaveBeenCalled();
  expect(await chatStorage.draft(auth.user.id, 'thread')).toBe(
    'My day was great, thanks!',
  );
  await act(async () => root.unmount());
});
it('does not submit an incomplete character profile', async () => {
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(
      <CharacterEditorScreen auth={auth} onDone={jest.fn()} />,
    );
  });
  await act(async () =>
    root.root
      .findByProps({
        accessibilityLabel: 'Lưu nhân vật',
        accessibilityRole: 'button',
      })
      .props.onPress(),
  );
  expect(chatApi.addCharacter).not.toHaveBeenCalled();
  expect(
    root.root
      .findAllByType(Text)
      .map(n => React.Children.toArray(n.props.children).join(''))
      .join('\n'),
  ).toContain('điền đầy đủ hồ sơ');
  await act(async () => root.unmount());
});
