import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { EnrollmentProgress } from './speakerVerification.service';

export function EnrollmentFeedback({
  active,
  enrollment,
  progress,
  notice,
  error,
  onCancel,
}: {
  active: boolean;
  enrollment?: EnrollmentProgress;
  progress: number;
  notice?: string;
  error?: string;
  onCancel: () => void;
}) {
  if (!active && !notice && !error) return <View />;
  const phase = enrollment?.phase ?? 'preparing';
  const title =
    phase === 'preparing'
      ? 'Đang chuẩn bị mic…'
      : phase === 'processing'
      ? 'Đang phân tích mẫu giọng…'
      : phase === 'saving'
      ? 'Đang kiểm tra và lưu mẫu…'
      : enrollment?.speechDetected
      ? 'Đã nghe thấy bạn · Tiếp tục đọc'
      : 'Đang chờ giọng nói';
  return (
    <View style={s.card}>
      {active ? (
        <>
          <View style={s.row}>
            <ActivityIndicator color="#55ddb6" />
            <Text style={s.title}>{title}</Text>
            <Text style={s.percent}>{progress}%</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Tiến độ ghi mẫu giọng"
            accessibilityValue={{ min: 0, max: 100, now: progress }}
            style={s.track}
          >
            <View style={[s.fill, { width: `${progress}%` }]} />
          </View>
          <Text style={s.text}>
            Đã thu {((enrollment?.capturedMs ?? 0) / 1000).toFixed(1)} / 10 giây
            giọng nói
          </Text>
          {phase === 'listening' ? (
            <>
              <View style={s.row}>
                <Text style={s.text}>Mức âm mic</Text>
                <View style={[s.track, s.meter]}>
                  <View
                    style={[
                      s.fill,
                      {
                        width: `${Math.round((enrollment?.level ?? 0) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={enrollment?.speechDetected ? s.text : s.warning}>
                {enrollment?.speechDetected
                  ? 'Nói tự nhiên; khoảng lặng không tính vào tiến độ.'
                  : 'Chưa nghe rõ giọng. Hãy nói gần mic hơn, kiểm tra mic đang dùng và quyền truy cập mic.'}
              </Text>
              <Text style={s.text}>
                Còn tối đa{' '}
                {Math.ceil((enrollment?.remainingMs ?? 90000) / 1000)} giây để
                thu mẫu.
              </Text>
            </>
          ) : (
            <Text style={s.text}>
              {phase === 'preparing'
                ? 'Chờ mic sẵn sàng rồi bắt đầu đọc.'
                : 'Vui lòng chờ kết quả; chỉ hoàn tất khi mẫu đã được lưu.'}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={s.cancel}
          >
            <Text style={s.title}>Hủy ghi mẫu</Text>
          </Pressable>
        </>
      ) : (
        <Text
          accessibilityLiveRegion="polite"
          style={error ? s.warning : s.title}
        >
          {error ? `Ghi mẫu chưa thành công: ${error}` : notice}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#111f31',
    borderColor: '#55ddb6',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#55ddb6', fontWeight: '700', flexShrink: 1 },
  percent: {
    color: '#f7fbff',
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 'auto',
  },
  text: { color: '#a9b7ca', fontSize: 13, lineHeight: 19 },
  warning: { color: '#ffd28a', fontSize: 13, lineHeight: 19 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#26394f',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#55ddb6' },
  meter: { flex: 1 },
  cancel: {
    alignItems: 'center',
    padding: 10,
    borderColor: '#365069',
    borderWidth: 1,
    borderRadius: 8,
  },
});
