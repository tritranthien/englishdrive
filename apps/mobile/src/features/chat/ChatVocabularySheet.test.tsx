import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Modal, TextInput, Text } from 'react-native';
import { ChatVocabularySheet, vocabularyTokens } from './ChatVocabularySheet';
import {
  chatApi,
  type ChatMessage,
  type ChatVocabularyLookup,
} from './chat.api';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('./chat.api', () => ({ chatApi: { vocabulary: jest.fn() } }));
const message = {
  id: 'message',
  threadId: 'thread',
  content: 'I get off work at six.',
} as ChatMessage;
const definition: ChatVocabularyLookup = {
  term: 'get off work',
  meaningVi: 'tan làm',
  pronunciation: '/ɡet ɒf wɜːk/',
  partOfSpeech: 'cụm động từ',
  explanation: 'Kết thúc giờ làm việc.',
  example: 'I get off work at five.',
};
let root: Renderer.ReactTestRenderer;
let save: jest.Mock;
let close: jest.Mock;
const button = (label: string) =>
  root.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: label,
  });
async function press(label: string) {
  await act(async () => button(label).props.onPress());
}
const texts = () =>
  root.root
    .findAllByType(Text)
    .map(node =>
      React.Children.toArray(node.props.children)
        .filter(value => typeof value === 'string')
        .join(''),
    )
    .join('\n');
beforeEach(async () => {
  jest.resetAllMocks();
  jest.mocked(chatApi.vocabulary).mockResolvedValue(definition);
  save = jest.fn(async () => {});
  close = jest.fn();
  await act(async () => {
    root = Renderer.create(
      <ChatVocabularySheet
        token="token"
        message={message}
        onSave={save}
        onClose={close}
      />,
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it('selects a phrase, checks its meaning and saves edited vocabulary only on request', async () => {
  expect(button('Tra nghĩa').props.disabled).toBe(true);
  await press('Chọn từ get (2)');
  await press('Chọn từ work (4)');
  await press('Tra nghĩa');
  expect(chatApi.vocabulary).toHaveBeenCalledWith(
    'token',
    'thread',
    'message',
    2,
    14,
  );
  expect(texts()).toContain(definition.pronunciation);
  expect(save).not.toHaveBeenCalled();
  await act(async () =>
    root.root
      .findAllByType(TextInput)
      .find(
        node =>
          node.props.accessibilityLabel === 'Nghĩa tiếng Việt của từ đã chọn',
      )!
      .props.onChangeText('kết thúc ca làm'),
  );
  await press('Lưu vào từ vựng');
  expect(save).toHaveBeenCalledWith([
    {
      term: 'get off work',
      meaningVi: 'kết thúc ca làm',
      example: definition.example,
    },
  ]);
  expect(texts()).toContain('Đã lưu vào tab Từ vựng.');
  expect(button('Đã lưu từ').props.disabled).toBe(true);
  await press('Đã lưu từ');
  expect(save).toHaveBeenCalledTimes(1);
});
it('supports reverse selection and a fresh word after completing a range', async () => {
  await press('Chọn từ work (4)');
  await press('Chọn từ get (2)');
  await press('Tra nghĩa');
  expect(chatApi.vocabulary).toHaveBeenLastCalledWith(
    'token',
    'thread',
    'message',
    2,
    14,
  );
  await press('Chọn từ six (6)');
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Tra nghĩa');
  expect(chatApi.vocabulary).toHaveBeenLastCalledWith(
    'token',
    'thread',
    'message',
    18,
    21,
  );
});
it('keeps lookup and save failures recoverable without reporting success', async () => {
  jest
    .mocked(chatApi.vocabulary)
    .mockRejectedValueOnce(new Error('Mất kết nối'));
  await press('Chọn từ get (2)');
  await press('Chọn từ work (4)');
  await press('Tra nghĩa');
  expect(texts()).toContain('Mất kết nối');
  expect(save).not.toHaveBeenCalled();
  await press('Tra nghĩa');
  save.mockRejectedValueOnce(new Error('Chưa lưu được'));
  await press('Lưu vào từ vựng');
  expect(texts()).toContain('Chưa lưu được');
  expect(texts()).not.toContain('Đã lưu vào tab Từ vựng.');
  await press('Lưu vào từ vựng');
  expect(texts()).toContain('Đã lưu vào tab Từ vựng.');
});
it('ignores an earlier lookup result after the selection changes', async () => {
  let resolve!: (result: ChatVocabularyLookup) => void;
  jest.mocked(chatApi.vocabulary).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await press('Chọn từ get (2)');
  await press('Tra nghĩa');
  await press('Chọn từ work (4)');
  await act(async () => resolve({ ...definition, term: 'get' }));
  expect(root.root.findAllByType(TextInput)).toHaveLength(0);
  expect(save).not.toHaveBeenCalled();
});
it('closes with the close button or Android back', async () => {
  await press('Đóng tra từ');
  await act(async () => root.root.findByType(Modal).props.onRequestClose());
  expect(close).toHaveBeenCalledTimes(2);
});
it('preserves offsets around emoji, apostrophes and hyphens', () => {
  const content = "🙂 I don't rush — it's part-time.";
  const tokens = vocabularyTokens(content);
  expect(tokens.map(word => word.text)).toEqual([
    'I',
    "don't",
    'rush',
    "it's",
    'part-time',
  ]);
  tokens.forEach(word =>
    expect(content.slice(word.start, word.end)).toBe(word.text),
  );
});
