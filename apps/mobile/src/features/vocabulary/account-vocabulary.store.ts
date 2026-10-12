import {
  deleteAccountVocabulary,
  importAccountVocabulary,
  listAccountVocabulary,
  saveAccountVocabulary,
  type AccountVocabulary,
} from '../../api/client';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import { vocabularyStore } from './vocabulary.store';

const queues = new Map<string, Promise<unknown>>();
const migrated = new Set<string>();
function serialized<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const result = (queues.get(userId) ?? Promise.resolve())
    .catch(() => {})
    .then(operation);
  queues.set(userId, result);
  const cleanup = () => {
    if (queues.get(userId) === result) queues.delete(userId);
  };
  void result.then(cleanup, cleanup);
  return result;
}
const pendingId = (userId: string) => `${userId}:pending`;
const input = (word: VocabularyHighlight) => ({
  term: word.term,
  meaningVi: word.meaningVi,
  ...(word.example ? { example: word.example } : {}),
});

async function synchronize(userId: string, token: string) {
  if (!migrated.has(userId)) {
    const legacy = await vocabularyStore.migrationItems(userId);
    for (let offset = 0; offset < legacy.length; offset += 100)
      await importAccountVocabulary(
        token,
        legacy.slice(offset, offset + 100).map(input),
      );
    // Keep the old phone copy as a backup. Mark only after every batch is acknowledged.
    await vocabularyStore.completeMigration(userId);
    migrated.add(userId);
  }
  for (const word of await vocabularyStore.list(pendingId(userId))) {
    await saveAccountVocabulary(token, input(word));
    await vocabularyStore.acknowledge(pendingId(userId), word);
  }
}

async function download(token: string): Promise<AccountVocabulary[]> {
  const items: AccountVocabulary[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listAccountVocabulary(token, cursor);
    items.push(...page.items);
    if (page.nextCursor && seen.has(page.nextCursor))
      throw new Error('Không tải được đầy đủ sổ từ vựng');
    if (page.nextCursor) seen.add(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const accountVocabularyStore = {
  list: (userId: string, token: string) =>
    serialized(userId, async () => {
      await synchronize(userId, token);
      return download(token);
    }),
  save: async (userId: string, token: string, words: VocabularyHighlight[]) => {
    // Stage immediately, even while an earlier network request is still pending.
    await vocabularyStore.save(pendingId(userId), words);
    return serialized(userId, async () => {
      await synchronize(userId, token);
      return download(token);
    });
  },
  remove: (userId: string, token: string, key: string) =>
    serialized(userId, async () => {
      await synchronize(userId, token);
      const items = await download(token);
      const item = items.find(word => word.key === key);
      if (item) await deleteAccountVocabulary(token, item.id);
      return items.filter(word => word.key !== key);
    }),
};
