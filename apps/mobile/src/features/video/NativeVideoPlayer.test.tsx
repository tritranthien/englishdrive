import React, { useState } from 'react';
import Renderer, { act } from 'react-test-renderer';
import { PanResponder, type PanResponderCallbacks } from 'react-native';
import { NativeVideoPlayer } from './NativeVideoPlayer';
import { DEFAULT_SUBTITLE_OVERLAY_STYLE } from './video.storage';

it('resizes with the corner independently from dragging and clamps the box to video bounds', async () => {
  const callbacks: PanResponderCallbacks[] = [];
  const original = PanResponder.create;
  const spy = jest.spyOn(PanResponder, 'create').mockImplementation(config => {
    callbacks.push(config);
    return original(config);
  });
  const changed = jest.fn();
  function Harness() {
    const [style, setStyle] = useState(DEFAULT_SUBTITLE_OVERLAY_STYLE);
    return (
      <NativeVideoPlayer
        playerId="p"
        sourceType="YOUTUBE"
        sourceUrl="https://youtube.com/watch?v=x"
        displayMode="BILINGUAL"
        activeCue={{
          id: 'a',
          index: 1,
          startMs: 0,
          endMs: 1000,
          textEn: 'Hello.',
          textVi: 'Xin chào.',
        }}
        overlayStyle={style}
        onProgress={jest.fn()}
        onChangeOverlayStyle={next => {
          changed(next);
          setStyle(next);
        }}
      />
    );
  }
  let root!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      root = Renderer.create(<Harness />);
    });
    const event = {} as Parameters<
      NonNullable<PanResponderCallbacks['onPanResponderGrant']>
    >[0];
    const gesture = { dx: 40, dy: 20 } as Parameters<
      NonNullable<PanResponderCallbacks['onPanResponderMove']>
    >[1];
    await act(async () => {
      callbacks[1].onPanResponderGrant!(event, gesture);
      callbacks[1].onPanResponderMove!(event, gesture);
    });
    expect(changed.mock.lastCall![0].fontScale).toBeGreaterThan(1);
    expect(changed.mock.lastCall![0].maxWidthPercent).toBe(98);
    expect(changed.mock.lastCall![0].offsetX).toBe(0);
    await act(async () => {
      callbacks[0].onPanResponderGrant!(event, gesture);
      callbacks[0].onPanResponderMove!(event, {
        ...gesture,
        dx: 1000,
        dy: -1000,
      });
    });
    expect(changed.mock.lastCall![0].offsetX).toBeLessThanOrEqual(24);
    expect(changed.mock.lastCall![0].offsetY).toBe(-118);
  } finally {
    if (root) await act(async () => root.unmount());
    spy.mockRestore();
  }
});
