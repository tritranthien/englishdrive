import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createVocabularyDeck,
  deleteVocabularyDeck,
  listVocabularyDecks,
  renameVocabularyDeck,
  type VocabularyDeck,
} from '../../api/client';

export function useVocabularyDecks(userId?: string, token?: string) {
  const [items, setItems] = useState<VocabularyDeck[]>([]);
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
    listVocabularyDecks(token)
      .then(result => {
        if (mounted && owner.current === userId) setItems(result.items);
      })
      .catch(() => {
        if (mounted && owner.current === userId)
          setError('Không tải được các bộ từ vựng. Hãy thử đồng bộ lại.');
      })
      .finally(() => {
        if (mounted && owner.current === userId) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [userId, token]);

  const run = useCallback(
    async <T>(operation: (accessToken: string) => Promise<T>) => {
      if (!userId || !token) throw new Error('Vui lòng đăng nhập');
      setPending(count => count + 1);
      setError(undefined);
      try {
        const result = await operation(token);
        const latest = await listVocabularyDecks(token);
        if (owner.current === userId) setItems(latest.items);
        return result;
      } catch (failure) {
        if (owner.current === userId)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không cập nhật được bộ từ vựng',
          );
        throw failure;
      } finally {
        if (owner.current === userId)
          setPending(count => Math.max(0, count - 1));
      }
    },
    [userId, token],
  );
  const reload = useCallback(() => run(async () => undefined), [run]);
  const create = useCallback(
    (name: string) =>
      run(accessToken => createVocabularyDeck(accessToken, name)),
    [run],
  );
  const rename = useCallback(
    (id: string, name: string) =>
      run(accessToken => renameVocabularyDeck(accessToken, id, name)),
    [run],
  );
  const remove = useCallback(
    (id: string) => run(accessToken => deleteVocabularyDeck(accessToken, id)),
    [run],
  );
  return {
    items,
    loading,
    saving: pending > 0,
    error,
    reload,
    create,
    rename,
    remove,
  };
}
