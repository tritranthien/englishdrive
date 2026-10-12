import { useCallback, useEffect, useRef, useState } from 'react';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import { type SavedVocabulary } from './vocabulary.store';
import { accountVocabularyStore } from './account-vocabulary.store';

export function useVocabulary(userId?: string, token?: string) {
  const [items, setItems] = useState<SavedVocabulary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  const owner = useRef(userId);
  owner.current = userId;
  useEffect(() => {
    let mounted = true;
    setItems([]);
    setError(undefined);
    setPending(0);
    if (!userId || !token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    accountVocabularyStore
      .list(userId, token)
      .then(saved => {
        if (mounted && owner.current === userId) setItems(saved);
      })
      .catch(() => {
        if (mounted && owner.current === userId)
          setError('Không mở được sổ từ vựng. Hãy thử tải lại.');
      })
      .finally(() => {
        if (mounted && owner.current === userId) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId, token]);

  const run = useCallback(
    async (operation: (id: string) => Promise<SavedVocabulary[]>) => {
      if (!userId || !token) throw new Error('Vui lòng đăng nhập để lưu từ');
      setPending(count => count + 1);
      setError(undefined);
      try {
        const saved = await operation(userId);
        if (owner.current === userId) setItems(saved);
      } catch (failure) {
        if (owner.current === userId)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không lưu được từ vựng',
          );
        throw failure;
      } finally {
        if (owner.current === userId)
          setPending(count => Math.max(0, count - 1));
      }
    },
    [userId, token],
  );
  const save = useCallback(
    (words: VocabularyHighlight[]) =>
      run(id => accountVocabularyStore.save(id, token!, words)),
    [run, token],
  );
  const remove = useCallback(
    (key: string) => run(id => accountVocabularyStore.remove(id, token!, key)),
    [run, token],
  );
  const reload = useCallback(
    () => run(id => accountVocabularyStore.list(id, token!)),
    [run, token],
  );
  const capture = useCallback(
    (word: VocabularyHighlight) => {
      void save([word]).catch(() => {});
    },
    [save],
  );
  return {
    items,
    loading,
    saving: pending > 0,
    error,
    save,
    remove,
    reload,
    capture,
  };
}
