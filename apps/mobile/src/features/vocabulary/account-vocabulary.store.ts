import {
  deleteAccountVocabulary,
  importAccountVocabulary,
  listAccountVocabulary,
  saveAccountVocabulary,
  type AccountVocabulary,
  assignVocabularyDeck,
  listVocabularyDecks,
} from '../../api/client';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import { vocabularyStore } from './vocabulary.store';
import type { VocabularyDraft } from './vocabulary.store';

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
const input = (word: VocabularyDraft) => ({
  term: word.term,
  meaningVi: word.meaningVi,
  ...(word.example ? { example: word.example } : {}),
  ...(word.deckId !== undefined ? { deckId: word.deckId } : {}),
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
  const pending = await vocabularyStore.list(pendingId(userId));
  const deckIds = pending.some(word => word.deckId)
    ? new Set((await listVocabularyDecks(token)).items.map(deck => deck.id))
    : undefined;
  for (const word of pending) {
    // A deck deleted on another device must not permanently block the outbox.
    const payload =
      word.deckId && !deckIds?.has(word.deckId)
        ? { ...input(word), deckId: null }
        : input(word);
    await saveAccountVocabulary(token, payload);
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
  save: async (
    userId: string,
    token: string,
    words: VocabularyHighlight[],
    deckId?: string | null,
  ) => {
    // Stage immediately, even while an earlier network request is still pending.
    await vocabularyStore.save(
      pendingId(userId),
      words.map(word => (deckId !== undefined ? { ...word, deckId } : word)),
    );
    return serialized(userId, async () => {
      await synchronize(userId, token);
      return download(token);
    });
  },
  move: (
    userId: string,
    token: string,
    keys: string[],
    deckId: string | null,
  ) =>
    serialized(userId, async () => {
      await synchronize(userId, token);
      const items = await download(token);
      const selected = [...new Set(keys)].map(key =>
        items.find(word => word.key === key),
      );
      if (!selected.length || selected.some(word => !word))
        throw new Error('Không tìm thấy từ đã chọn. Hãy đồng bộ và thử lại.');
      if (selected.length > 100)
        throw new Error('Mỗi lần chuyển tối đa 100 từ');
      await assignVocabularyDeck(
        token,
        selected.map(word => word!.id),
        deckId,
      );
      return download(token);
    }),
  remove: (userId: string, token: string, key: string) =>
    serialized(userId, async () => {
      await synchronize(userId, token);
      const items = await download(token);
      const item = items.find(word => word.key === key);
      if (item) await deleteAccountVocabulary(token, item.id);
      return items.filter(word => word.key !== key);
    }),
};
