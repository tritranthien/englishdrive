import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput, Text } from 'react-native';
import {
  ChatThreadScreen,
  CharacterEditorScreen,
  mergeMessages,
} from './ChatScreens';
import { chatApi, type ChatMessage, type ChatThread } from './chat.api';
import { chatStorage } from './chat.storage';
import type { ChatSession } from './useChat';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('./chat.api', () => ({
  chatApi: {
    messages: jest.fn(),
    read: jest.fn(),
    help: jest.fn(),
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
      />,
    );
  });
  const texts = root.root
    .findAllByType(Text)
    .map(n => React.Children.toArray(n.props.children).join(''))
    .join('\n');
  expect(texts).toContain('Mai');
  expect(texts).toContain('How was your day?');
  expect(texts).toContain('Dịch');
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
