import { NativeModules } from 'react-native';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';

export type SavedVocabulary = VocabularyHighlight & {
  id?: string;
  key: string;
  savedAt: number;
  updatedAt: number;
  deckId?: string | null;
};
export type VocabularyDraft = VocabularyHighlight & { deckId?: string | null };

type NativeStore = {
  read(userId: string): Promise<string | null>;
  write(userId: string, payload: string): Promise<void>;
};
const queues = new Map<string, Promise<unknown>>();

function storage(): NativeStore {
  const module = NativeModules.VocabularyStorage as NativeStore | undefined;
  if (!module) throw new Error('Không mở được bộ nhớ từ vựng');
  return module;
}

export function vocabularyKey(term: string) {
  return term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// All reads and mutations for an account share a queue so rapid Gemini tool
// calls, manual saves and deletes cannot overwrite each other's changes.
function serialized<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!userId) return Promise.reject(new Error('Vui lòng đăng nhập để lưu từ'));
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

async function readItems(userId: string): Promise<SavedVocabulary[]> {
  const payload = await storage().read(userId);
  if (!payload) return [];
  const data = JSON.parse(payload) as {
    version: number;
    items: SavedVocabulary[];
  };
  if (
    data.version !== 1 ||
    !Array.isArray(data.items) ||
    data.items.some(
      item =>
        !item ||
        typeof item.key !== 'string' ||
        typeof item.term !== 'string' ||
        typeof item.meaningVi !== 'string' ||
        (item.example != null && typeof item.example !== 'string') ||
        !Number.isFinite(item.savedAt) ||
        !Number.isFinite(item.updatedAt) ||
        (item.deckId != null && typeof item.deckId !== 'string'),
    )
  )
    throw new Error('Không đọc được sổ từ vựng đã lưu');
  return data.items;
}

async function writeItems(userId: string, items: SavedVocabulary[]) {
  await storage().write(userId, JSON.stringify({ version: 1, items }));
  return items;
}

export const vocabularyStore = {
  acknowledge: (userId: string, expected: SavedVocabulary) =>
    serialized(userId, async () => {
      const items = await readItems(userId);
      return writeItems(
        userId,
        items.filter(
          item =>
            item.key !== expected.key ||
            item.updatedAt !== expected.updatedAt ||
            item.term !== expected.term ||
            item.meaningVi !== expected.meaningVi ||
            item.example !== expected.example ||
            item.deckId !== expected.deckId,
        ),
      );
    }),
  migrationItems: (userId: string) =>
    serialized(userId, async () => {
      const payload = await storage().read(userId);
      if (!payload || (JSON.parse(payload) as { migrated?: boolean }).migrated)
        return [];
      return readItems(userId);
    }),
  completeMigration: (userId: string) =>
    serialized(userId, async () => {
      const items = await readItems(userId);
      await storage().write(
        userId,
        JSON.stringify({ version: 1, items, migrated: true }),
      );
    }),
  list: (userId: string) => serialized(userId, () => readItems(userId)),
  save: (userId: string, words: VocabularyDraft[]) =>
    serialized(userId, async () => {
      const items = new Map(
        (await readItems(userId)).map(item => [item.key, item]),
      );
      const now = Date.now();
      for (const word of words) {
        const term = word.term.trim().replace(/\s+/g, ' ');
        const meaningVi = word.meaningVi.trim();
        const example = word.example?.trim();
        if (!term || !meaningVi)
          throw new Error('Vui lòng nhập từ và nghĩa tiếng Việt');
        if (
          term.length > 120 ||
          meaningVi.length > 1000 ||
          (example?.length ?? 0) > 2000
        )
          throw new Error('Nội dung từ vựng quá dài');
        const key = vocabularyKey(term);
        const previous = items.get(key);
        items.set(key, {
          key,
          term,
          meaningVi,
          example: example || previous?.example,
          savedAt: previous?.savedAt ?? now,
          updatedAt: now,
          ...(word.deckId !== undefined
            ? { deckId: word.deckId }
            : previous?.deckId !== undefined
              ? { deckId: previous.deckId }
              : {}),
        });
      }
      return writeItems(
        userId,
        [...items.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      );
    }),
  remove: (userId: string, key: string) =>
    serialized(userId, async () =>
      writeItems(
        userId,
        (await readItems(userId)).filter(item => item.key !== key),
      ),
    ),
};
