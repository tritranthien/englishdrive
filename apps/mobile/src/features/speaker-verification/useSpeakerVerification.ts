import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  speakerVerificationService,
  type SpeakerProfileKind,
  type SpeakerVerificationStatus,
} from './speakerVerification.service';

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : 'Voice enrollment failed';
}

export function useSpeakerVerification() {
  const [status, setStatus] = useState<SpeakerVerificationStatus>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();

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
      setError('Microphone permission is required');
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

  return { status, progress, error, enroll, cancel, remove, refresh };
}
