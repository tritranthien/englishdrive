import { NativeModules } from 'react-native';
import { accountVocabularyStore } from './account-vocabulary.store';
import { vocabularyStore } from './vocabulary.store';
import {
  deleteAccountVocabulary,
  importAccountVocabulary,
  listAccountVocabulary,
  saveAccountVocabulary,
  assignVocabularyDeck,
  listVocabularyDecks,
} from '../../api/client';

jest.mock('../../api/client', () => ({
  deleteAccountVocabulary: jest.fn(),
  importAccountVocabulary: jest.fn(),
  listAccountVocabulary: jest.fn(),
  saveAccountVocabulary: jest.fn(),
  assignVocabularyDeck: jest.fn(),
  listVocabularyDecks: jest.fn(),
}));
const word = {
  term: 'commute',
  meaningVi: 'đi làm',
  example: 'I commute by bus.',
};
const remote = {
  ...word,
  id: 'remote-id',
  key: 'commute',
  savedAt: 1,
  updatedAt: 2,
};
let owner = '';
let counter = 0;
const database = new Map<string, string>();
beforeEach(() => {
  jest.resetAllMocks();
  database.clear();
  owner = `owner-${++counter}`;
  NativeModules.VocabularyStorage = {
    read: jest.fn(async (id: string) => database.get(id) ?? null),
    write: jest.fn(async (id: string, value: string) => {
      database.set(id, value);
    }),
  };
  jest
    .mocked(listAccountVocabulary)
    .mockResolvedValue({ items: [remote], nextCursor: null });
  jest.mocked(saveAccountVocabulary).mockResolvedValue(remote);
  jest.mocked(importAccountVocabulary).mockResolvedValue({ imported: 1 });
  jest.mocked(listVocabularyDecks).mockResolvedValue({
    items: [
      {
        id: 'work-deck',
        name: 'Work',
        wordCount: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
});

test('manual saves retain their deck in the outbox across offline retries', async () => {
  jest
    .mocked(saveAccountVocabulary)
    .mockRejectedValueOnce(new Error('Offline'));
  await expect(
    accountVocabularyStore.save(owner, 'token', [word], 'work-deck'),
  ).rejects.toThrow('Offline');
  expect((await vocabularyStore.list(`${owner}:pending`))[0].deckId).toBe(
    'work-deck',
  );
  await accountVocabularyStore.list(owner, 'token');
  expect(saveAccountVocabulary).toHaveBeenLastCalledWith('token', {
    ...word,
    deckId: 'work-deck',
  });
});

test('moves by server IDs and rejects stale selected keys before sending a request', async () => {
  jest.mocked(assignVocabularyDeck).mockResolvedValue({ moved: 1 });
  await accountVocabularyStore.move(
    owner,
    'token',
    ['commute', 'commute'],
    'work-deck',
  );
  expect(assignVocabularyDeck).toHaveBeenCalledWith(
    'token',
    ['remote-id'],
    'work-deck',
  );
  await expect(
    accountVocabularyStore.move(owner, 'token', ['missing'], null),
  ).rejects.toThrow('Không tìm thấy');
  expect(assignVocabularyDeck).toHaveBeenCalledTimes(1);
});

test('a newer deck assignment survives acknowledgement of an earlier queued save', async () => {
  const key = `${owner}:pending`;
  const first = (
    await vocabularyStore.save(key, [{ ...word, deckId: 'first-deck' }])
  )[0];
  await vocabularyStore.save(key, [{ ...word, deckId: 'second-deck' }]);
  await vocabularyStore.acknowledge(key, first);
  expect((await vocabularyStore.list(key))[0].deckId).toBe('second-deck');
});

test('a pending word goes to Unclassified if its deck was deleted on another device', async () => {
  jest.mocked(listVocabularyDecks).mockResolvedValue({ items: [] });
  await vocabularyStore.save(`${owner}:pending`, [
    { ...word, deckId: 'deleted-deck' },
  ]);
  await accountVocabularyStore.list(owner, 'token');
  expect(saveAccountVocabulary).toHaveBeenCalledWith('token', {
    ...word,
    deckId: null,
  });
  expect(await vocabularyStore.list(`${owner}:pending`)).toEqual([]);
});

test('imports legacy words once and retains the old phone backup', async () => {
  await vocabularyStore.save(owner, [word]);
  expect(await accountVocabularyStore.list(owner, 'owner-token')).toEqual([
    remote,
  ]);
  expect(importAccountVocabulary).toHaveBeenCalledWith('owner-token', [word]);
  await accountVocabularyStore.list(owner, 'owner-token');
  expect(importAccountVocabulary).toHaveBeenCalledTimes(1);
  expect(await vocabularyStore.list(owner)).toHaveLength(1);
  expect(await vocabularyStore.migrationItems(owner)).toEqual([]);
});

test('failed migration keeps all old data and is retried before marking complete', async () => {
  await vocabularyStore.save(owner, [word]);
  jest
    .mocked(importAccountVocabulary)
    .mockRejectedValueOnce(new Error('Offline'));
  await expect(accountVocabularyStore.list(owner, 'token')).rejects.toThrow(
    'Offline',
  );
  expect(await vocabularyStore.migrationItems(owner)).toHaveLength(1);
  await accountVocabularyStore.list(owner, 'token');
  expect(importAccountVocabulary).toHaveBeenCalledTimes(2);
  expect(await vocabularyStore.migrationItems(owner)).toEqual([]);
});

test('retains unsent new words until acknowledged on the next sync', async () => {
  jest
    .mocked(saveAccountVocabulary)
    .mockRejectedValueOnce(new Error('Offline'));
  await expect(
    accountVocabularyStore.save(owner, 'token', [word]),
  ).rejects.toThrow('Offline');
  expect(await vocabularyStore.list(`${owner}:pending`)).toHaveLength(1);
  await accountVocabularyStore.list(owner, 'token');
  expect(saveAccountVocabulary).toHaveBeenCalledTimes(2);
  expect(await vocabularyStore.list(`${owner}:pending`)).toEqual([]);
});

test('loads all backend pages with the same account token', async () => {
  jest
    .mocked(listAccountVocabulary)
    .mockResolvedValueOnce({ items: [remote], nextCursor: 'next-page' })
    .mockResolvedValueOnce({
      items: [{ ...remote, id: 'second', key: 'hello', term: 'hello' }],
      nextCursor: null,
    });
  expect(await accountVocabularyStore.list(owner, 'token')).toHaveLength(2);
  expect(listAccountVocabulary).toHaveBeenLastCalledWith('token', 'next-page');
});

test('deletes by the server ID and never reimports the retained legacy backup', async () => {
  await vocabularyStore.save(owner, [word]);
  await accountVocabularyStore.list(owner, 'token');
  expect(
    await accountVocabularyStore.remove(owner, 'token', 'commute'),
  ).toEqual([]);
  expect(deleteAccountVocabulary).toHaveBeenCalledWith('token', 'remote-id');
  await accountVocabularyStore.list(owner, 'token');
  expect(importAccountVocabulary).toHaveBeenCalledTimes(1);
});

test('another account cannot upload the first accounts phone words or pending saves', async () => {
  await vocabularyStore.save(owner, [word]);
  await vocabularyStore.save(`${owner}:pending`, [word]);
  await accountVocabularyStore.list(`${owner}-other`, 'other-token');
  expect(importAccountVocabulary).not.toHaveBeenCalled();
  expect(saveAccountVocabulary).not.toHaveBeenCalled();
  expect(listAccountVocabulary).toHaveBeenCalledWith('other-token', undefined);
});

test('a slow acknowledgement cannot discard a newer correction of the same word', async () => {
  let acknowledge!: (value: typeof remote) => void;
  let notifyStarted!: () => void;
  const started = new Promise<void>(resolve => {
    notifyStarted = resolve;
  });
  jest.mocked(saveAccountVocabulary).mockImplementationOnce(() => {
    notifyStarted();
    return new Promise(resolve => {
      acknowledge = resolve;
    });
  });
  const first = accountVocabularyStore.save(owner, 'token', [word]);
  await started;
  const correction = { ...word, meaningVi: 'đi lại hằng ngày' };
  const second = accountVocabularyStore.save(owner, 'token', [correction]);
  expect((await vocabularyStore.list(`${owner}:pending`))[0].meaningVi).toBe(
    correction.meaningVi,
  );
  acknowledge(remote);
  await Promise.all([first, second]);
  expect(saveAccountVocabulary).toHaveBeenLastCalledWith('token', correction);
  expect(await vocabularyStore.list(`${owner}:pending`)).toEqual([]);
});
