import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SpeakerMatchEvent, SpeakerThresholdSettings } from './speakerVerification.service';

const labels: Record<SpeakerMatchEvent['decision'], string> = {
  waiting: 'Chưa đủ âm thanh để tính điểm',
  matching: 'Đang kiểm tra giọng nói',
  accepted: 'Đã chấp nhận giọng nói',
  rejected: 'Điểm không đạt ngưỡng',
  continuity: 'Kế thừa giọng đã xác nhận',
  bypassed: 'Đang bỏ qua bộ lọc giọng nói',
  off: 'Bộ lọc giọng nói đang tắt',
};
const quantize = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;

export function SpeakerMatchSettings({ settings, match, active, enabled, saving, onSave }: {
  settings: SpeakerThresholdSettings;
  match?: SpeakerMatchEvent;
  active: boolean;
  enabled: boolean;
  saving: boolean;
  onSave: (value: number | null) => Promise<void>;
}) {
  const value = settings.effective ?? 0;
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const width = useRef(1);
  const startValue = useRef(value);
  const disabled = !enabled || saving;
  useEffect(() => {
    draftRef.current = value;
    setDraft(value);
  }, [value, saving]);
  const change = (next: number) => {
    draftRef.current = quantize(next);
    setDraft(draftRef.current);
  };
  const save = async (next: number | null) => {
    try {
      await onSave(next);
    } catch {
      change(value);
    }
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: event => {
      change(event.nativeEvent.locationX / width.current);
      startValue.current = draftRef.current;
    },
    onPanResponderMove: (_, gesture) => change(startValue.current + gesture.dx / width.current),
    onPanResponderRelease: () => { void save(draftRef.current); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => change(value),
  }), [disabled, onSave, value]);
  const adjust = (delta: number) => {
    if (!disabled) void save(quantize(value + delta));
  };
  const current = active ? match : undefined;
  const score = current?.decision === 'continuity' || current?.decision === 'bypassed' || current?.decision === 'off'
    ? null : current?.score;
  const applied = current?.threshold;
  const pending = active && enabled && applied != null && Math.abs(applied - value) > 0.00001;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>ĐỘ KHỚP & NGƯỠNG</Text>
      <Text style={styles.score}>
        Điểm: {score == null ? '—' : score.toFixed(2)} · Ngưỡng đang dùng: {applied == null ? '—' : applied.toFixed(2)}
      </Text>
      <Text style={styles.hint}>{!active ? 'Chưa mở hội thoại' : current ? labels[current.decision] : 'Đang chờ giọng nói'}</Text>
      <Text style={styles.label}>
        Ngưỡng {settings.manual == null ? 'tự động' : 'thủ công'}: {draft.toFixed(2)}
      </Text>
      <View style={styles.row}>
        <Pressable accessibilityLabel="Giảm ngưỡng khớp" disabled={disabled} onPress={() => adjust(-0.01)} style={styles.button}>
          <Text style={styles.buttonText}>−</Text>
        </Pressable>
        <View
          style={[styles.slider, disabled && styles.disabled]}
          onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width); }}
          {...responder.panHandlers}
          accessible accessibilityRole="adjustable" accessibilityLabel="Ngưỡng khớp giọng nói"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(draft * 100), text: draft.toFixed(2) }}
          accessibilityState={{ disabled }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 0.01 : -0.01)}
        >
          <View pointerEvents="none" style={styles.track} />
          <View pointerEvents="none" style={[styles.fill, { width: `${draft * 100}%` }]} />
          <View pointerEvents="none" style={[styles.thumb, { left: `${draft * 100}%` }]} />
        </View>
        <Pressable accessibilityLabel="Tăng ngưỡng khớp" disabled={disabled} onPress={() => adjust(0.01)} style={styles.button}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>0,00: dễ chấp nhận ← → 1,00: chặt hơn. Điểm cosine không phải xác suất.</Text>
      <Text style={styles.hint}>
        {saving ? 'Đang lưu…' : pending ? 'Đã lưu. Áp dụng từ câu tiếp theo.' : 'Lưu riêng cho mic này. Thay đổi trong hội thoại áp dụng từ câu tiếp theo.'}
      </Text>
      <Pressable disabled={disabled || settings.manual == null} onPress={() => { void save(null); }} style={styles.reset}>
        <Text style={[styles.resetText, (disabled || settings.manual == null) && styles.disabled]}>
          Về ngưỡng tự động{settings.automatic == null ? '' : ` (${settings.automatic.toFixed(2)})`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 12, marginVertical: 12, backgroundColor: '#0b1727', borderRadius: 12 },
  title: { color: '#55ddb6', fontWeight: '800', fontSize: 12, marginBottom: 8 },
  score: { color: '#f7fbff', fontSize: 15, lineHeight: 23, fontVariant: ['tabular-nums'] },
  label: { color: '#f7fbff', marginTop: 12, fontSize: 15 },
  hint: { color: '#a9b7ca', fontSize: 12, lineHeight: 18, marginTop: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  button: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#55ddb6', fontSize: 26 },
  slider: { flex: 1, height: 44, justifyContent: 'center' },
  track: { position: 'absolute', height: 5, width: '100%', borderRadius: 3, backgroundColor: '#365069' },
  fill: { position: 'absolute', height: 5, borderRadius: 3, backgroundColor: '#55ddb6' },
  thumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, backgroundColor: '#f7fbff' },
  reset: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  resetText: { color: '#55ddb6', fontSize: 13 },
  disabled: { opacity: 0.4 },
});
