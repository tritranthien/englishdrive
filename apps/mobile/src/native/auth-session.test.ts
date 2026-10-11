import { NativeModules } from 'react-native';
import { authSession } from './auth-session';

const session = {
  accessToken: 'session-token',
  user: { id: '1', email: 'test@example.com', name: 'Test' },
};
const native = {
  save: jest.fn(),
  restore: jest.fn(),
  clear: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.AuthSession = native;
});

test('restores the saved login after reopening', async () => {
  native.restore.mockResolvedValue(JSON.stringify(session));
  expect(await authSession.restore()).toEqual(session);
});

test('a signed-out or expired session requires login', async () => {
  native.restore.mockResolvedValue(null);
  expect(await authSession.restore()).toBeUndefined();
});

test('clears invalid saved data instead of restoring it', async () => {
  native.restore.mockResolvedValue('{"accessToken":"token","user":null}');
  expect(await authSession.restore()).toBeUndefined();
  expect(native.clear).toHaveBeenCalledTimes(1);
});

test('persists the token and user without the password', async () => {
  await authSession.save({
    ...session,
    password: 'never-store',
  } as typeof session);
  expect(JSON.parse(native.save.mock.calls[0][0])).toEqual(session);
});

test('logout clears storage and reports a failed clear', async () => {
  await authSession.clear();
  expect(native.clear).toHaveBeenCalledTimes(1);
  native.clear.mockRejectedValue(new Error('Storage unavailable'));
  await expect(authSession.clear()).rejects.toThrow('Storage unavailable');
});
