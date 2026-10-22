import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { chatApi } from './chat.api';
import { useChatTyping } from './useChatTyping';

jest.mock('./chat.api', () => ({
  chatApi: { typing: jest.fn(async () => ({})) },
}));
function Draft({ focused = true, hasDraft = true }) {
  useChatTyping('token', 'thread', focused, hasDraft);
  return null;
}
let root: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('renews the typing hold for an unsent draft and releases it after sending or clearing', async () => {
  await act(async () => {
    root = Renderer.create(<Draft />);
  });
  expect(chatApi.typing).toHaveBeenLastCalledWith('token', 'thread', true);
  await act(async () => {
    jest.advanceTimersByTime(40000);
  });
  expect(chatApi.typing).toHaveBeenCalledTimes(5);
  await act(async () => {
    root.update(<Draft hasDraft={false} />);
  });
  expect(chatApi.typing).toHaveBeenLastCalledWith('token', 'thread', false);
  await act(async () => {
    jest.advanceTimersByTime(40000);
  });
  expect(chatApi.typing).toHaveBeenCalledTimes(6);
});
it('releases the hold when backgrounded or leaving the conversation', async () => {
  let change!: (state: string) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      change = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
  await act(async () => {
    root = Renderer.create(<Draft />);
  });
  await act(async () => {
    change('background');
  });
  expect(chatApi.typing).toHaveBeenLastCalledWith('token', 'thread', false);
  await act(async () => {
    jest.advanceTimersByTime(40000);
  });
  expect(chatApi.typing).toHaveBeenCalledTimes(2);
  await act(async () => {
    change('active');
  });
  expect(chatApi.typing).toHaveBeenLastCalledWith('token', 'thread', true);
  await act(async () => {
    root.update(<Draft focused={false} />);
  });
  expect(chatApi.typing).toHaveBeenLastCalledWith('token', 'thread', false);
});
it('preserves request order when a user sends then immediately drafts another message', async () => {
  let resolve!: () => void;
  jest.mocked(chatApi.typing).mockImplementationOnce(
    () =>
      new Promise<void>(done => {
        resolve = done;
      }),
  );
  await act(async () => {
    root = Renderer.create(<Draft />);
  });
  await act(async () => {
    root.update(<Draft hasDraft={false} />);
  });
  await act(async () => {
    root.update(<Draft />);
  });
  expect(chatApi.typing).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve();
  });
  expect(jest.mocked(chatApi.typing).mock.calls.map(call => call[2])).toEqual([
    true,
    false,
    true,
  ]);
});
