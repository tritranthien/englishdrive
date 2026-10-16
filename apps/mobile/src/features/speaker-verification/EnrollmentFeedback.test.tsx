import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { EnrollmentFeedback } from './EnrollmentFeedback';

it('shows mic guidance during silence and keeps cancel available', async () => {
  const cancel = jest.fn();
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(
      <EnrollmentFeedback
        active
        progress={32}
        enrollment={{
          progress: 32,
          capturedMs: 3200,
          targetMs: 10000,
          remainingMs: 64000,
          phase: 'listening',
          level: 0.01,
          speechDetected: false,
        }}
        onCancel={cancel}
      />,
    );
  });
  const text = root.root
    .findAllByType(Text)
    .map(node => React.Children.toArray(node.props.children).join(''))
    .join('\n');
  expect(text).toContain('3.2 / 10 giây');
  expect(text).toContain('Chưa nghe rõ giọng');
  expect(text).toContain('64 giây');
  expect(
    root.root.findByProps({ accessibilityRole: 'progressbar' }).props
      .accessibilityValue.now,
  ).toBe(32);
  await act(async () =>
    root.root.findByProps({ accessibilityRole: 'button' }).props.onPress(),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
