import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Dimensions, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { ChatWordPopup } from './ChatWordPopup';
import { ChatMessageText } from './ChatMessageText';
import { chatApi, type ChatMessage } from './chat.api';

jest.mock('./chat.api', () => ({
  chatApi: { vocabulary: jest.fn(), help: jest.fn() },
}));
const message = {
  id: 'm',
  threadId: 't',
  role: 'CHARACTER',
  content: '😀 Play football today.',
} as ChatMessage;
const result = {
  term: 'football',
  meaningVi: 'bóng đá',
  pronunciation: '/ˈfʊtbɔːl/',
  partOfSpeech: 'danh từ',
  explanation: 'Môn thể thao.',
  example: 'I play football.',
};
let root: Renderer.ReactTestRenderer;
const button = (label: string) =>
  root.root.findByProps({
    accessibilityRole: 'button',
    accessibilityLabel: label,
  });
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  jest.restoreAllMocks();
});
it('opens word options on a single tap', async () => {
  const onSelect = jest.fn();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  await act(async () => {
    root = Renderer.create(
      <ChatMessageText
        content={message.content}
        choosingPhrase={false}
        onSelect={onSelect}
      />,
    );
  });
  const event = { nativeEvent: { pageX: 20, pageY: 100 } };
  await act(async () => {
    button('Tùy chọn từ football').props.onPress(event);
  });
  expect(onSelect).toHaveBeenCalledWith({ start: 8, end: 16, x: 20, y: 100 });
});
it('looks up the selected range directly and saves only after explicit request', async () => {
  jest.mocked(chatApi.vocabulary).mockResolvedValue(result);
  const onSave = jest.fn().mockResolvedValue(undefined);
  await act(async () => {
    root = Renderer.create(
      <ChatWordPopup
        token="token"
        message={message}
        selection={{ start: 8, end: 16, x: 20, y: 100 }}
        onClose={jest.fn()}
        onChoosePhrase={jest.fn()}
        onHelp={jest.fn()}
        onSave={onSave}
      />,
    );
  });
  await act(async () => {
    button('Dịch từ').props.onPress();
  });
  expect(chatApi.vocabulary).toHaveBeenCalledWith('token', 't', 'm', 8, 16);
  expect(onSave).not.toHaveBeenCalled();
  expect(button('Lưu từ').props.disabled).toBe(false);
  await act(async () => {
    button('Chi tiết').props.onPress();
  });
  await act(async () => {
    await button('Lưu từ').props.onPress();
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(button('Đã lưu').props.disabled).toBe(true);
});

it('saves vocabulary directly from the explanation and allows retry after a save error', async () => {
  jest.mocked(chatApi.vocabulary).mockClear().mockResolvedValue(result);
  const onSave = jest
    .fn()
    .mockRejectedValueOnce(new Error('Mất kết nối'))
    .mockResolvedValueOnce(undefined);
  const onHelp = jest.fn();
  await act(async () => {
    root = Renderer.create(
      <ChatWordPopup
        token="token"
        message={message}
        selection={{ start: 8, end: 16, x: 20, y: 100 }}
        onClose={jest.fn()}
        onChoosePhrase={jest.fn()}
        onHelp={onHelp}
        onSave={onSave}
      />,
    );
  });
  await act(async () => button('Giải thích từ').props.onPress());
  expect(chatApi.vocabulary).toHaveBeenCalledWith('token', 't', 'm', 8, 16);
  expect(onHelp).not.toHaveBeenCalled();
  expect(root.root.findByProps({ children: result.explanation })).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => button('Lưu từ').props.onPress());
  expect(root.root.findByProps({ children: 'Mất kết nối' })).toBeTruthy();
  expect(button('Lưu từ').props.disabled).toBe(false);
  await act(async () => button('Lưu từ').props.onPress());
  expect(onSave).toHaveBeenLastCalledWith([
    {
      term: 'football',
      meaningVi: 'bóng đá',
      example: 'I play football.',
    },
  ]);
  expect(button('Đã lưu').props.disabled).toBe(true);
  expect(chatApi.vocabulary).toHaveBeenCalledTimes(1);
});

it('explains the whole message without selecting it and saves each useful expression separately', async () => {
  const vocabulary = [
    {
      term: 'play football',
      meaningVi: 'chơi bóng đá',
      example: 'We play football on Sundays.',
    },
    { term: 'today', meaningVi: 'hôm nay', example: 'It is sunny today.' },
  ];
  jest
    .mocked(chatApi.help)
    .mockResolvedValue({ text: 'Rủ chơi bóng đá hôm nay.', vocabulary });
  const onSave = jest.fn().mockResolvedValue(undefined);
  await act(async () => {
    root = Renderer.create(
      <ChatWordPopup
        token="token"
        message={message}
        selection={{ start: 8, end: 16, x: 20, y: 100 }}
        onClose={jest.fn()}
        onChoosePhrase={jest.fn()}
        onHelp={jest.fn()}
        onSave={onSave}
      />,
    );
  });
  await act(async () => button('Cả câu').props.onPress());
  expect(chatApi.help).toHaveBeenCalledWith('token', 't', 'explain', 'm');
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => button('Lưu từ play football').props.onPress());
  expect(onSave).toHaveBeenCalledWith([vocabulary[0]]);
  expect(button('Lưu từ play football').props.disabled).toBe(true);
  expect(button('Lưu từ today').props.disabled).toBe(false);
  await act(async () => button('Lưu từ today').props.onPress());
  expect(onSave).toHaveBeenLastCalledWith([vocabulary[1]]);
  await act(async () => button('Tùy chọn').props.onPress());
  expect(button('Giải thích từ')).toBeTruthy();
});

it('keeps options compact and moves above the selection when needed', async () => {
  const y = Dimensions.get('window').height - 40;
  const onChoosePhrase = jest.fn();
  const onClose = jest.fn();
  await act(async () => {
    root = Renderer.create(
      <ChatWordPopup
        token="token"
        message={message}
        selection={{ start: 8, end: 16, x: 20, y }}
        onClose={onClose}
        onChoosePhrase={onChoosePhrase}
        onHelp={jest.fn()}
        onSave={jest.fn()}
      />,
    );
  });
  expect(root.root.findByType(Modal).props.transparent).toBe(true);
  const popover = () =>
    StyleSheet.flatten(
      root.root
        .findAllByType(View)
        .find(node => node.props.accessibilityViewIsModal)?.props.style,
    );
  expect(popover().width).toBeLessThanOrEqual(248);
  await act(async () => {
    root.root.findByType(ScrollView).props.onContentSizeChange(248, 180);
  });
  expect(popover().top).toBeLessThan(y);
  expect(popover().top + 182).toBeLessThan(y);
  await act(async () => button('Chọn cụm').props.onPress());
  expect(onChoosePhrase).toHaveBeenCalledTimes(1);
  await act(async () => button('Đóng').props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
});
