import { chatStorage } from './chat.storage';
import { flushChatOutbox } from './useChat';
import { chatApi } from './chat.api';
jest.mock('./chat.api', () => ({ chatApi: { send: jest.fn() } }));

it('preserves concurrent offline messages and isolates accounts and drafts', async () => {
  const first = await chatStorage.newId();
  const second = await chatStorage.newId();
  const item = {
    threadId: 'thread',
    content: 'Hello',
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    chatStorage.stage('offline-user', { ...item, clientMessageId: first }),
    chatStorage.stage('offline-user', { ...item, clientMessageId: second }),
  ]);
  expect(await chatStorage.pending('offline-user')).toHaveLength(2);
  expect(await chatStorage.pending('other-user')).toEqual([]);
  await chatStorage.acknowledge('offline-user', first);
  expect((await chatStorage.pending('offline-user'))[0].clientMessageId).toBe(
    second,
  );
  await chatStorage.saveDraft(
    'offline-user',
    'thread',
    'Draft waiting for network',
  );
  expect(await chatStorage.draft('offline-user', 'thread')).toBe(
    'Draft waiting for network',
  );
  expect(await chatStorage.draft('other-user', 'thread')).toBe('');
});
it('keeps failed sends for retry and reuses their client ID after reconnecting', async () => {
  const id = await chatStorage.newId();
  await chatStorage.stage('retry-user', {
    threadId: 'thread',
    clientMessageId: id,
    content: 'Hi!',
    createdAt: new Date().toISOString(),
  });
  (chatApi.send as jest.Mock).mockRejectedValueOnce(new Error('Offline'));
  await flushChatOutbox('retry-user', 'token');
  expect(await chatStorage.pending('retry-user')).toEqual([
    expect.objectContaining({ clientMessageId: id, failed: true }),
  ]);
  (chatApi.send as jest.Mock).mockResolvedValue({});
  await Promise.all([
    flushChatOutbox('retry-user', 'token'),
    flushChatOutbox('retry-user', 'token'),
  ]);
  expect(await chatStorage.pending('retry-user')).toEqual([]);
  expect(chatApi.send).toHaveBeenCalledTimes(2);
  expect(chatApi.send).toHaveBeenLastCalledWith('token', 'thread', id, 'Hi!');
});
