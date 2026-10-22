import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthResult } from '../../api/client';
import { chatApi, type ChatThread } from './chat.api';
import { chatStorage, type PendingChatMessage } from './chat.storage';

const syncing = new Map<string, Promise<void>>();
export async function flushChatOutbox(userId: string, token: string) {
  const existing = syncing.get(userId);
  if (existing) {
    await existing;
    return;
  }
  const task = (async () => {
    for (const message of await chatStorage.pending(userId)) {
      try {
        await chatApi.send(
          token,
          message.threadId,
          message.clientMessageId,
          message.content,
        );
        await chatStorage.acknowledge(userId, message.clientMessageId);
      } catch {
        await chatStorage.markFailed(userId, message.clientMessageId, true);
        break;
      }
    }
  })();
  syncing.set(userId, task);
  try {
    await task;
  } finally {
    syncing.delete(userId);
  }
}
export function useChat(auth: AuthResult) {
  const { id: userId } = auth.user;
  const token = auth.accessToken;
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [pending, setPending] = useState<PendingChatMessage[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const fetched = useRef(false);
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      await flushChatOutbox(userId, token);
      const items = await chatApi.threads(token);
      if (!mounted.current) return;
      fetched.current = true;
      setThreads(items);
      setError(undefined);
      await chatStorage.cacheThreads(userId, items);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Chưa kết nối được hộp thư');
    } finally {
      const items = await chatStorage.pending(userId).catch(() => []);
      if (mounted.current) {
        setPending(items);
        setLoading(false);
      }
      refreshing.current = false;
    }
  }, [userId, token]);
  useEffect(() => {
    mounted.current = true;
    void chatStorage
      .threads(userId)
      .then(items => {
        if (mounted.current && !fetched.current && items.length)
          setThreads(items);
      })
      .catch(() => {});
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 20000);
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') void refresh();
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      state.remove();
    };
  }, [userId, refresh]);
  const send = useCallback(
    async (threadId: string, content: string) => {
      const message = {
        threadId,
        content,
        clientMessageId: await chatStorage.newId(),
        createdAt: new Date().toISOString(),
      };
      await chatStorage.stage(userId, message);
      if (mounted.current) setPending(await chatStorage.pending(userId));
      await chatStorage.clearDraftIfUnchanged(userId, threadId, content);
      await flushChatOutbox(userId, token);
      if (mounted.current) setPending(await chatStorage.pending(userId));
      void refresh();
    },
    [userId, token, refresh],
  );
  return {
    threads,
    pending,
    loading,
    error,
    refresh,
    send,
    unread: threads.reduce((sum, thread) => sum + (thread.unread ?? 0), 0),
  };
}
export type ChatSession = ReturnType<typeof useChat>;
