import { NativeModules } from 'react-native';
import type { ChatMessage, ChatThread } from './chat.api';
type NativeStore = {
  read(userId: string, key: string): Promise<string | null>;
  write(userId: string, key: string, value: string): Promise<void>;
  newId(): Promise<string>;
};
const native = NativeModules.ChatStorage as NativeStore | undefined;
const memory = new Map<string, string>();
const queues = new Map<string, Promise<unknown>>();
export type PendingChatMessage = {
  clientMessageId: string;
  threadId: string;
  content: string;
  createdAt: string;
  failed?: boolean;
};
async function read<T>(userId: string, key: string, fallback: T): Promise<T> {
  const value = native
    ? await native.read(userId, key)
    : memory.get(`${userId}:${key}`);
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
async function write(userId: string, key: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (native) await native.write(userId, key, payload);
  else memory.set(`${userId}:${key}`, payload);
}
function serialized<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const task = (queues.get(userId) ?? Promise.resolve())
    .catch(() => {})
    .then(fn);
  queues.set(userId, task);
  void task
    .finally(() => {
      if (queues.get(userId) === task) queues.delete(userId);
    })
    .catch(() => {});
  return task;
}
export const chatStorage = {
  newId: () =>
    native
      ? native.newId()
      : Promise.resolve(
          'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.floor(Math.random() * 16);
            return (c === 'x' ? r : 8 + (r % 4)).toString(16);
          }),
        ),
  threads: (userId: string) => read<ChatThread[]>(userId, 'threads', []),
  cacheThreads: (userId: string, threads: ChatThread[]) =>
    write(userId, 'threads', threads),
  messages: (userId: string, threadId: string) =>
    read<ChatMessage[]>(userId, `messages:${threadId}`, []),
  cacheMessages: (userId: string, threadId: string, messages: ChatMessage[]) =>
    write(userId, `messages:${threadId}`, messages.slice(-200)),
  pending: (userId: string) => read<PendingChatMessage[]>(userId, 'outbox', []),
  stage: (userId: string, message: PendingChatMessage) =>
    serialized(userId, async () => {
      const items = await read<PendingChatMessage[]>(userId, 'outbox', []);
      if (!items.some(item => item.clientMessageId === message.clientMessageId))
        items.push(message);
      await write(userId, 'outbox', items);
    }),
  acknowledge: (userId: string, id: string) =>
    serialized(userId, async () => {
      const items = await read<PendingChatMessage[]>(userId, 'outbox', []);
      await write(
        userId,
        'outbox',
        items.filter(item => item.clientMessageId !== id),
      );
    }),
  markFailed: (userId: string, id: string, failed: boolean) =>
    serialized(userId, async () => {
      const items = await read<PendingChatMessage[]>(userId, 'outbox', []);
      await write(
        userId,
        'outbox',
        items.map(item =>
          item.clientMessageId === id ? { ...item, failed } : item,
        ),
      );
    }),
  draft: (userId: string, threadId: string) =>
    read<string>(userId, `draft:${threadId}`, ''),
  saveDraft: (userId: string, threadId: string, draft: string) =>
    serialized(userId, () => write(userId, `draft:${threadId}`, draft)),
};
