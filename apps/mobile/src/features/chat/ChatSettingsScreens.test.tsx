import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ChatPreferencesScreen } from './ChatSettingsScreens';
import { ChatToggle, ChatButton } from './ChatScreens';
import { chatApi } from './chat.api';

jest.mock('./chat.api', () => ({
  chatApi: {
    preferences: jest.fn(),
    status: jest.fn(),
    savePreferences: jest.fn(),
  },
}));
jest.mock('./chat.notifications', () => ({
  chatNotifications: { register: jest.fn(async () => ({})) },
}));

it('defaults AI corrections on and saves an off choice across reopening settings', async () => {
  const prefs = {
    enabled: true,
    minMinutes: 120,
    maxMinutes: 360,
    dailyLimit: 6,
    quietStart: 22,
    quietEnd: 8,
    timezone: 'UTC',
  };
  const auth = {
    accessToken: 'token',
    user: { id: 'user', name: 'Test', email: 'test@example.com' },
  };
  jest.mocked(chatApi.preferences).mockResolvedValue(prefs as never);
  jest
    .mocked(chatApi.status)
    .mockResolvedValue({ pushConfigured: false, proactiveEnabled: true });
  jest
    .mocked(chatApi.savePreferences)
    .mockImplementation(async (_token, body) => body);
  let root!: Renderer.ReactTestRenderer;
  const toggle = () =>
    root.root
      .findAllByType(ChatToggle)
      .find(node => node.props.label === 'AI sửa lỗi tin nhắn')!;
  try {
    await act(async () => {
      root = Renderer.create(<ChatPreferencesScreen auth={auth} />);
    });
    expect(toggle().props.value).toBe(true);
    await act(async () => toggle().props.onChange(false));
    await act(async () =>
      root.root
        .findAllByType(ChatButton)
        .find(node => node.props.label === 'Lưu cài đặt tin nhắn')!
        .props.onPress(),
    );
    expect(chatApi.savePreferences).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ autoCorrect: false }),
    );
    await act(async () => root.unmount());
    jest
      .mocked(chatApi.preferences)
      .mockResolvedValue({ ...prefs, autoCorrect: false });
    await act(async () => {
      root = Renderer.create(<ChatPreferencesScreen auth={auth} />);
    });
    expect(toggle().props.value).toBe(false);
  } finally {
    if (root) await act(async () => root.unmount());
  }
});
