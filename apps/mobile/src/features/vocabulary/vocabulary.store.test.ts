import { NativeModules } from 'react-native';
import { vocabularyStore } from './vocabulary.store';

const database = new Map<string, string>();
const native = {
  read: jest.fn(async (userId: string) => database.get(userId) ?? null),
  write: jest.fn(async (userId: string, payload: string) => {
    database.set(userId, payload);
  }),
};
const commute = {
  term: 'commute',
  meaningVi: 'đi lại giữa nhà và nơi làm việc',
  example: 'I commute by bus.',
};

beforeEach(() => {
  database.clear();
  jest.clearAllMocks();
  NativeModules.VocabularyStorage = native;
});

test('restores saved words when the notebook is reopened', async () => {
  await vocabularyStore.save('user-a', [commute]);
  const saved = await vocabularyStore.list('user-a');
  expect(saved).toEqual([expect.objectContaining(commute)]);
  expect(saved[0].savedAt).toBeGreaterThan(0);
});

test('normalizes case and spaces and keeps an existing example on a repeated term', async () => {
  await vocabularyStore.save('user-a', [
    { ...commute, term: '  Get   off WORK ' },
  ]);
  const previous = await vocabularyStore.list('user-a');
  await vocabularyStore.save('user-a', [
    { term: 'get off work', meaningVi: 'tan làm' },
  ]);
  const saved = await vocabularyStore.list('user-a');
  expect(saved).toHaveLength(1);
  expect(saved[0].meaningVi).toBe('tan làm');
  expect(saved[0].example).toBe(commute.example);
  expect(saved[0].savedAt).toBe(previous[0].savedAt);
});

test('rapid independent Gemini words cannot overwrite each other', async () => {
  await Promise.all([
    vocabularyStore.save('user-a', [commute]),
    vocabularyStore.save('user-a', [
      { term: 'deadline', meaningVi: 'hạn chót' },
    ]),
    vocabularyStore.save('user-a', [
      { term: 'groceries', meaningVi: 'đồ tạp hóa' },
    ]),
  ]);
  expect(
    (await vocabularyStore.list('user-a')).map(item => item.key).sort(),
  ).toEqual(['commute', 'deadline', 'groceries']);
});

test('account notebooks stay separate and survive switching accounts', async () => {
  await vocabularyStore.save('user-a', [commute]);
  expect(await vocabularyStore.list('user-b')).toEqual([]);
  await vocabularyStore.save('user-b', [
    { term: 'hello', meaningVi: 'xin chào' },
  ]);
  expect((await vocabularyStore.list('user-a'))[0].term).toBe('commute');
  expect((await vocabularyStore.list('user-b'))[0].term).toBe('hello');
});

test('removes only the selected word and retains all others', async () => {
  await vocabularyStore.save('user-a', [
    commute,
    { term: 'hello', meaningVi: 'xin chào' },
  ]);
  await vocabularyStore.remove('user-a', 'commute');
  expect((await vocabularyStore.list('user-a')).map(item => item.term)).toEqual(
    ['hello'],
  );
});

test('failed writes are reported and do not poison the next save', async () => {
  native.write.mockRejectedValueOnce(new Error('Disk full'));
  await expect(vocabularyStore.save('user-a', [commute])).rejects.toThrow(
    'Disk full',
  );
  expect(await vocabularyStore.list('user-a')).toEqual([]);
  await vocabularyStore.save('user-a', [commute]);
  expect(await vocabularyStore.list('user-a')).toHaveLength(1);
});

test('corrupt stored data is not overwritten by a later save', async () => {
  database.set('user-a', '{bad-json');
  await expect(vocabularyStore.save('user-a', [commute])).rejects.toThrow();
  expect(native.write).not.toHaveBeenCalled();
  expect(database.get('user-a')).toBe('{bad-json');
});
