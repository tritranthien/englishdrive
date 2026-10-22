import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useDraftTranslation, translatedCaret } from './useDraftTranslation';
import { chatApi } from './chat.api';

jest.mock('./chat.api', () => ({ chatApi: { translateDraft: jest.fn() } }));
let state: ReturnType<typeof useDraftTranslation>;
function Harness({
  draft,
  onTranslated,
  threadId = 'thread',
}: {
  draft: string;
  onTranslated: jest.Mock;
  threadId?: string;
}) {
  state = useDraftTranslation({
    token: 'token',
    threadId,
    draft,
    selection: { start: draft.length, end: draft.length },
    onTranslated,
  });
  return null;
}
let root: Renderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  jest.useRealTimers();
});
it('translates complete markers after debounce and keeps surrounding text', async () => {
  const onTranslated = jest.fn();
  jest
    .mocked(chatApi.translateDraft)
    .mockResolvedValue({
      replacements: [{ start: 15, end: 24, text: 'football' }],
    });
  await act(async () => {
    root = Renderer.create(
      <Harness
        draft={'i want to play `bóng đá`!'}
        onTranslated={onTranslated}
      />,
    );
  });
  expect(state!.blocked).toBe(true);
  await act(async () => {
    jest.advanceTimersByTime(299);
  });
  expect(chatApi.translateDraft).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(onTranslated).toHaveBeenCalledWith('i want to play football!', {
    start: 24,
    end: 24,
  });
});
it('discards an old response after the learner changes the draft', async () => {
  const onTranslated = jest.fn();
  let finish!: (value: {
    replacements: Array<{ start: number; end: number; text: string }>;
  }) => void;
  jest.mocked(chatApi.translateDraft).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve;
    }),
  );
  await act(async () => {
    root = Renderer.create(
      <Harness draft={'`bóng đá`'} onTranslated={onTranslated} />,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await act(async () => {
    root.update(<Harness draft="new text" onTranslated={onTranslated} />);
  });
  await act(async () => {
    finish({ replacements: [{ start: 0, end: 9, text: 'football' }] });
  });
  expect(onTranslated).not.toHaveBeenCalled();
  expect(state!.blocked).toBe(false);
});
it('keeps the original draft on failure and retries only on request', async () => {
  const onTranslated = jest.fn();
  jest
    .mocked(chatApi.translateDraft)
    .mockRejectedValueOnce(new Error('Mất mạng'))
    .mockResolvedValue({
      replacements: [{ start: 0, end: 9, text: 'football' }],
    });
  await act(async () => {
    root = Renderer.create(
      <Harness draft={'`bóng đá`'} onTranslated={onTranslated} />,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(state!.error).toBe('Mất mạng');
  expect(state!.blocked).toBe(true);
  expect(onTranslated).not.toHaveBeenCalled();
  await act(async () => {
    state!.retry();
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(onTranslated).toHaveBeenCalledWith('football', { start: 8, end: 8 });
});
it('does not translate missing or empty pairs', async () => {
  await act(async () => {
    root = Renderer.create(
      <Harness draft={'hello `word'} onTranslated={jest.fn()} />,
    );
  });
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(chatApi.translateDraft).not.toHaveBeenCalled();
});
it('maps a caret inside and after multiple replaced ranges', () => {
  const replacements = [
    { start: 2, end: 7, text: 'a' },
    { start: 10, end: 14, text: 'longer' },
  ];
  expect(translatedCaret(1, replacements)).toBe(1);
  expect(translatedCaret(4, replacements)).toBe(3);
  expect(translatedCaret(15, replacements)).toBe(13);
});
