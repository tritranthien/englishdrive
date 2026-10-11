import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { SpeakerMatchSettings } from './SpeakerMatchSettings';
import type { SpeakerMatchEvent } from './speakerVerification.service';

const settings = { automatic: 0.3, manual: 0.4, effective: 0.4 };
const match: SpeakerMatchEvent = { profileKind: 'phone', score: 0.27, threshold: 0.3, decision: 'rejected' };
const content = (root: Renderer.ReactTestRenderer) => root.root.findAllByType(Text)
  .map(node => React.Children.toArray(node.props.children).join('')).join('\n');

it('shows actual score and applied threshold separately from the saved pending threshold', async () => {
  let root!: Renderer.ReactTestRenderer;
  await act(async () => { root = Renderer.create(<SpeakerMatchSettings settings={settings} match={match} active enabled saving={false} onSave={jest.fn()} />); });
  expect(content(root)).toContain('Điểm: 0.27 · Ngưỡng đang dùng: 0.30');
  expect(content(root)).toContain('Ngưỡng thủ công: 0.40');
  expect(content(root)).toContain('Áp dụng từ câu tiếp theo');
  await act(async () => root.unmount());
});

it('does not present an old score for continuity bypass off or an inactive session', async () => {
  let root!: Renderer.ReactTestRenderer;
  await act(async () => { root = Renderer.create(<SpeakerMatchSettings settings={settings} match={match} active enabled saving={false} onSave={jest.fn()} />); });
  for (const decision of ['continuity', 'bypassed', 'off'] as const) {
    await act(async () => root.update(<SpeakerMatchSettings settings={settings} match={{ ...match, decision }} active enabled saving={false} onSave={jest.fn()} />));
    expect(content(root)).toContain('Điểm: —');
  }
  await act(async () => root.update(<SpeakerMatchSettings settings={settings} match={match} active={false} enabled saving={false} onSave={jest.fn()} />));
  expect(content(root)).toContain('Điểm: —');
  expect(content(root)).toContain('Chưa mở hội thoại');
  await act(async () => root.unmount());
});

it('increments by one hundredth and resets to automatic without claiming a failed save succeeded', async () => {
  const save = jest.fn(async (_value: number | null) => { throw new Error('Disk full'); });
  let root!: Renderer.ReactTestRenderer;
  await act(async () => { root = Renderer.create(<SpeakerMatchSettings settings={settings} active={false} enabled saving={false} onSave={save} />); });
  await act(async () => root.root.findByProps({ accessibilityLabel: 'Tăng ngưỡng khớp' }).props.onPress());
  expect(save).toHaveBeenLastCalledWith(0.41);
  expect(content(root)).toContain('Ngưỡng thủ công: 0.40');
  const reset = root.root.findAll(node => node.props.onPress && node.props.disabled === false)
    .find(node => node.findAllByType(Text).some(text => React.Children.toArray(text.props.children).join('').includes('Về ngưỡng tự động')));
  expect(reset).toBeDefined();
  await act(async () => reset!.props.onPress());
  expect(save).toHaveBeenLastCalledWith(null);
  await act(async () => root.unmount());
});
