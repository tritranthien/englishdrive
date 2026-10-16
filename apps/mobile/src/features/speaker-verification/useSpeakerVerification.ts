import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  speakerVerificationService,
  type SpeakerProfileKind,
  type SpeakerVerificationStatus,
  type SpeakerMatchEvent,
  type EnrollmentProgress,
} from './speakerVerification.service';
import { liveAudioService } from '../live-conversation/services/liveAudio.service';

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/timed out/i.test(message))
    return 'Chưa thu đủ 10 giây giọng nói trong 90 giây. Hãy kiểm tra mic, đến gần hơn và thử lại.';
  if (/unclear/i.test(message))
    return 'Mẫu giọng chưa rõ hoặc không nhất quán. Hãy ghi lại ở nơi yên tĩnh, nói bằng giọng bình thường.';
  if (/already in use/i.test(message))
    return 'Mic đang được sử dụng. Hãy dừng hội thoại hoặc tắt câu gọi rồi thử lại.';
  if (/Connect your headset/i.test(message))
    return 'Hãy kết nối tai nghe trước khi ghi mẫu mic tai nghe.';
  if (/Disconnect your headset/i.test(message))
    return 'Hãy ngắt tai nghe trước khi ghi mẫu mic điện thoại.';
  return error instanceof Error ? error.message : 'Không ghi được mẫu giọng';
}

export function useSpeakerVerification() {
  const [status, setStatus] = useState<SpeakerVerificationStatus>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [match, setMatch] = useState<SpeakerMatchEvent>();
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentProgress>();
  const [notice, setNotice] = useState<string>();
  const enrollmentRequest = useRef(false);
  const cancelled = useRef(false);
  const thresholdRequest = useRef(false);

  const setThreshold = useCallback(
    async (kind: SpeakerProfileKind, value: number | null) => {
      if (thresholdRequest.current) return;
      thresholdRequest.current = true;
      setSavingThreshold(true);
      setError(undefined);
      try {
        setStatus(await speakerVerificationService.setThreshold(kind, value));
      } catch (nextError) {
        setError(messageFor(nextError));
        throw nextError;
      } finally {
        thresholdRequest.current = false;
        setSavingThreshold(false);
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!speakerVerificationService.available) return;
    const next = await speakerVerificationService.getStatus();
    // A status request started before enrollment must not hide its progress UI.
    if (enrollmentRequest.current) return;
    setStatus(next);
    if (next.enrolling && next.enrollment) {
      setEnrollment(next.enrollment);
      setProgress(next.enrollment.progress);
    }
  }, []);

  const enroll = useCallback(
    async (kind: SpeakerProfileKind) => {
      if (Platform.OS !== 'android' || enrollmentRequest.current) return;
      enrollmentRequest.current = true;
      cancelled.current = false;
      setError(undefined);
      setNotice(undefined);
      setEnrollment(undefined);
      setProgress(0);
      try {
        const microphone = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (microphone !== PermissionsAndroid.RESULTS.GRANTED) {
          setError('Vui lòng cấp quyền sử dụng mic');
          return;
        }
        setStatus(current =>
          current
            ? { ...current, enrolling: true, enrollingKind: kind }
            : current,
        );
        setEnrollment({
          progress: 0,
          phase: 'preparing',
          capturedMs: 0,
          targetMs: 10000,
          remainingMs: 90000,
          level: 0,
          speechDetected: false,
        });
        const nextStatus = await speakerVerificationService.startEnrollment(
          kind,
        );
        setStatus(
          nextStatus ? { ...nextStatus, enrolling: false } : nextStatus,
        );
        if (!cancelled.current) {
          setProgress(100);
          const message = `Đã lưu mẫu giọng mic ${
            kind === 'phone' ? 'điện thoại' : 'tai nghe'
          } thành công. Bạn có thể bắt đầu trò chuyện.`;
          setNotice(message);
          Alert.alert('Ghi mẫu giọng thành công', message);
        }
      } catch (nextError) {
        if (!cancelled.current) {
          const message = messageFor(nextError);
          setError(message);
          Alert.alert('Không ghi được mẫu giọng', message);
        }
      } finally {
        enrollmentRequest.current = false;
        setStatus(current =>
          current ? { ...current, enrolling: false } : current,
        );
        await refresh().catch(() => {});
      }
    },
    [refresh],
  );

  const cancel = useCallback(async () => {
    cancelled.current = true;
    setError(undefined);
    try {
      const nextStatus = await speakerVerificationService.cancelEnrollment();
      setStatus(nextStatus ? { ...nextStatus, enrolling: false } : nextStatus);
      setNotice('Đã hủy ghi mẫu. Mẫu giọng cũ (nếu có) vẫn được giữ.');
    } catch (nextError) {
      cancelled.current = false;
      setError(messageFor(nextError));
    }
  }, []);

  const remove = useCallback(async (kind: SpeakerProfileKind) => {
    setError(undefined);
    setNotice(undefined);
    setProgress(0);
    setStatus(await speakerVerificationService.deleteProfile(kind));
  }, []);

  useEffect(() => {
    if (!liveAudioService.available) return;
    const subscription = liveAudioService.onSpeakerMatch(setMatch);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    refresh().catch(nextError => setError(messageFor(nextError)));
    if (!speakerVerificationService.available) return;
    const subscription = speakerVerificationService.onProgress(event => {
      if (cancelled.current) return;
      setEnrollment(event);
      setProgress(event.progress);
    });
    const appState = AppState.addEventListener('change', nextState => {
      if (nextState === 'active')
        refresh().catch(nextError => setError(messageFor(nextError)));
    });
    return () => {
      subscription.remove();
      appState.remove();
    };
  }, [refresh]);

  return {
    status,
    progress,
    enrollment,
    notice,
    error,
    enroll,
    cancel,
    remove,
    refresh,
    match,
    savingThreshold,
    setThreshold,
  };
}
