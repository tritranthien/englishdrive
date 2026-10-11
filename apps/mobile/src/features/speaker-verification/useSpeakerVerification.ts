import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  speakerVerificationService,
  type SpeakerProfileKind,
  type SpeakerVerificationStatus,
  type SpeakerMatchEvent,
} from './speakerVerification.service';
import { liveAudioService } from '../live-conversation/services/liveAudio.service';

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Không ghi được mẫu giọng';
}

export function useSpeakerVerification() {
  const [status, setStatus] = useState<SpeakerVerificationStatus>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  const [match, setMatch] = useState<SpeakerMatchEvent>();
  const [savingThreshold, setSavingThreshold] = useState(false);
  const thresholdRequest = useRef(false);

  const setThreshold = useCallback(async (kind: SpeakerProfileKind, value: number | null) => {
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
  }, []);

  const refresh = useCallback(async () => {
    if (!speakerVerificationService.available) return;
    setStatus(await speakerVerificationService.getStatus());
  }, []);

  const enroll = useCallback(async (kind: SpeakerProfileKind) => {
    if (Platform.OS !== 'android') return;
    setError(undefined);
    const microphone = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (microphone !== PermissionsAndroid.RESULTS.GRANTED) {
      setError('Vui lòng cấp quyền sử dụng mic');
      return;
    }
    setProgress(0);
    setStatus(current => (current ? { ...current, enrolling: true } : current));
    try {
      const nextStatus = await speakerVerificationService.startEnrollment(kind);
      setStatus(nextStatus ? { ...nextStatus, enrolling: false } : nextStatus);
    } catch (nextError) {
      setError(messageFor(nextError));
      await refresh().catch(() => {});
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    setError(undefined);
    const nextStatus = await speakerVerificationService.cancelEnrollment();
    setStatus(nextStatus ? { ...nextStatus, enrolling: false } : nextStatus);
  }, []);

  const remove = useCallback(async (kind: SpeakerProfileKind) => {
    setError(undefined);
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
    const subscription = speakerVerificationService.onProgress(setProgress);
    const appState = AppState.addEventListener('change', nextState => {
      if (nextState === 'active')
        refresh().catch(nextError => setError(messageFor(nextError)));
    });
    return () => {
      subscription.remove();
      appState.remove();
    };
  }, [refresh]);

  return { status, progress, error, enroll, cancel, remove, refresh, match, savingThreshold, setThreshold };
}
