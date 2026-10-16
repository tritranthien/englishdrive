import { NativeModules } from 'react-native';

jest.mock('./chat.api', () => ({
  chatApi: {
    device: jest.fn(async () => {}),
    removeDevice: jest.fn(async () => {}),
  },
}));
const native = {
  configure: jest.fn(),
  clear: jest.fn(async () => {}),
  consumeOpen: jest.fn(),
  setVisibleThread: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
NativeModules.ChatNotifications = native;
const { chatNotifications } =
  require('./chat.notifications') as typeof import('./chat.notifications');
const { chatApi } = require('./chat.api') as typeof import('./chat.api');

it('does not let delayed token registration rebind a signed-out account', async () => {
  const state = {
    configured: true,
    permissionGranted: true,
    token: 'push-token',
    installationId: 'install-id',
  };
  let resolve!: (value: typeof state) => void;
  native.configure
    .mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      }),
    )
    .mockResolvedValue(state);
  const registration = chatNotifications.register('user', 'auth-token');
  const logout = chatNotifications.clear('auth-token', 'user');
  resolve(state);
  await Promise.all([registration, logout]);
  expect(chatApi.device).not.toHaveBeenCalled();
  expect(chatApi.removeDevice).toHaveBeenCalledWith('auth-token', 'install-id');
  expect(native.clear).toHaveBeenCalledTimes(1);
});
