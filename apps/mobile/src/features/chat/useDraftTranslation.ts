import { useEffect, useRef, useState } from 'react';
import {
  backtickSpans,
  replaceDraftSpans,
} from '../../../../../packages/shared/src/draft-translation';
import { chatApi } from './chat.api';

export function translatedCaret(
  position: number,
  replacements: Array<{ start: number; end: number; text: string }>,
) {
  let shift = 0;
  for (const item of [...replacements].sort((a, b) => a.start - b.start)) {
    if (position < item.start) break;
    if (position < item.end) return item.start + shift + item.text.length;
    shift += item.text.length - (item.end - item.start);
  }
  return position + shift;
}

export function useDraftTranslation({
  token,
  threadId,
  draft,
  selection,
  onTranslated,
}: {
  token: string;
  threadId: string;
  draft: string;
  selection: { start: number; end: number };
  onTranslated: (
    text: string,
    selection: { start: number; end: number },
  ) => void;
}) {
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ draft, selection, onTranslated });
  latest.current = { draft, selection, onTranslated };
  const hasSpans = backtickSpans(draft).length > 0;
  useEffect(() => {
    let active = true;
    setError(undefined);
    setTranslating(false);
    if (!hasSpans) return;
    setTranslating(true);
    const timer = setTimeout(() => {
      void chatApi
        .translateDraft(token, threadId, draft)
        .then(result => {
          if (!active || latest.current.draft !== draft) return;
          const expected = backtickSpans(draft);
          const replacements = [...result.replacements].sort(
            (a, b) => a.start - b.start,
          );
          if (
            replacements.length !== expected.length ||
            replacements.some(
              (item, index) =>
                item.start !== expected[index].start ||
                item.end !== expected[index].end ||
                !item.text.trim() ||
                item.text.includes('`'),
            )
          )
            throw new Error('Bản dịch không khớp. Hãy thử lại.');
          const text = replaceDraftSpans(draft, replacements);
          if (text.length > 4000)
            throw new Error('Câu sau khi dịch vượt quá 4.000 ký tự');
          const currentSelection = latest.current.selection;
          latest.current.onTranslated(text, {
            start: translatedCaret(currentSelection.start, replacements),
            end: translatedCaret(currentSelection.end, replacements),
          });
        })
        .catch(failure => {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Chưa dịch được phần đã đánh dấu',
            );
        })
        .finally(() => {
          if (active) setTranslating(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, [draft, token, threadId, hasSpans, attempt]);
  return {
    translating,
    error,
    blocked: hasSpans,
    retry: () => setAttempt(value => value + 1),
  };
}
