/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import { Text } from 'react-native';
import { authSession } from '../src/native/auth-session';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

jest.mock('../src/native/auth-session', () => ({
  authSession: { restore: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authSession.restore).mockResolvedValue(undefined);
  jest.mocked(authSession.clear).mockResolvedValue(undefined);
});

jest.mock('react-native-webrtc', () => ({
  mediaDevices: { getUserMedia: jest.fn() },
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCView: 'RTCView',
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('reopening restores the conversation screen and logout removes the saved session', async () => {
  jest.mocked(authSession.restore).mockResolvedValue({
    accessToken: 'stored-session',
    user: { id: '1', email: 'test@example.com', name: 'Saved User' },
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(
    renderer.root
      .findAllByType(Text)
      .some(text => text.props.children === 'Saved User'),
  ).toBe(true);
  await ReactTestRenderer.act(async () => {
    renderer.root
      .find(
        node =>
          node.props.accessibilityLabel === 'Cài đặt' &&
          typeof node.props.onPress === 'function',
      )
      .props.onPress();
  });
  const logout = renderer.root.findAll(
    node =>
      typeof node.props.onPress === 'function' &&
      node
        .findAllByType(Text)
        .some(text => text.props.children === 'Đăng xuất'),
  )[0];
  expect(logout).toBeDefined();
  await ReactTestRenderer.act(async () => {
    await logout!.props.onPress();
  });
  expect(authSession.clear).toHaveBeenCalledTimes(1);
  expect(
    renderer.root
      .findAllByType(Text)
      .some(text => text.props.children === 'Saved User'),
  ).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
