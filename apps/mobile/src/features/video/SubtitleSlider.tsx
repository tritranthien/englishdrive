import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, Text, View } from 'react-native';
import { videoStyles as s } from './video.styles';

export function SubtitleSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const width = useRef(1);
  const origin = useRef(value);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const change = useCallback(
    (next: number) =>
      latest.current.onChange(
        Number(
          Math.min(
            max,
            Math.max(min, min + Math.round((next - min) / step) * step),
          ).toFixed(2),
        ),
      ),
    [min, max, step],
  );
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: event => {
          origin.current =
            min +
            Math.min(
              1,
              Math.max(0, event.nativeEvent.locationX / width.current),
            ) *
              (max - min);
          change(origin.current);
        },
        onPanResponderMove: (_, gesture) =>
          change(origin.current + (gesture.dx / width.current) * (max - min)),
        onPanResponderTerminationRequest: () => false,
      }),
    [min, max, change],
  );
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <View style={{ gap: 2 }}>
      <View style={s.row}>
        <Text style={[s.controlLabel, s.grow]}>{label}</Text>
        <Text style={s.valueBadge}>{Math.round(value * 100)}%</Text>
      </View>
      <View
        {...responder.panHandlers}
        testID={`slider-${label}`}
        onLayout={event => {
          width.current = Math.max(1, event.nativeEvent.layout.width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{
          min: Math.round(min * 100),
          max: Math.round(max * 100),
          now: Math.round(value * 100),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event =>
          change(
            latest.current.value +
              (event.nativeEvent.actionName === 'increment' ? step : -step),
          )
        }
        style={{ height: 44, justifyContent: 'center', marginHorizontal: 12 }}
      >
        <View
          pointerEvents="none"
          style={{ height: 4, borderRadius: 2, backgroundColor: '#365069' }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            height: 4,
            width: `${percent}%`,
            backgroundColor: '#55ddb6',
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${percent}%`,
            marginLeft: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#55ddb6',
          }}
        />
      </View>
    </View>
  );
}
