import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  speakerVerificationService,
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

  const enroll = useCallback(async () => {
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
      setStatus(await speakerVerificationService.startEnrollment());
    } catch (nextError) {
      setError(messageFor(nextError));
      await refresh().catch(() => {});
    }
  }, [refresh]);

  const cancel = useCallback(async () => {
    setError(undefined);
    setStatus(await speakerVerificationService.cancelEnrollment());
  }, []);

  const remove = useCallback(async () => {
    setError(undefined);
    setProgress(0);
    setStatus(await speakerVerificationService.deleteProfile());
  }, []);

  useEffect(() => {
    refresh().catch(nextError => setError(messageFor(nextError)));
    if (!speakerVerificationService.available) return;
    const subscription = speakerVerificationService.onProgress(setProgress);
    return () => subscription.remove();
  }, [refresh]);

  return { status, progress, error, enroll, cancel, remove, refresh };
}
