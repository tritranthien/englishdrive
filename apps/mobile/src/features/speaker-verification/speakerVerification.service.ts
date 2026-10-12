import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type SpeakerVerificationStatus = {
  configured: boolean;
  phoneEnrolled: boolean;
  headsetEnrolled: boolean;
  needsReenrollment: boolean;
  enrolling: boolean;
  enrollingKind?: SpeakerProfileKind;
  currentRouteKind: SpeakerProfileKind;
  thresholds: Record<SpeakerProfileKind, SpeakerThresholdSettings>;
};

export type SpeakerThresholdSettings = {
  automatic: number | null;
  manual: number | null;
  effective: number | null;
};

export type SpeakerMatchEvent = {
  sampleSpeechMs?: number | null;
  profileKind: SpeakerProfileKind;
  score: number | null;
  threshold: number | null;
  decision: 'waiting' | 'matching' | 'accepted' | 'rejected' | 'continuity' | 'bypassed' | 'off';
  reason?: string | null;
};

export type SpeakerProfileKind = 'phone' | 'headset';

type SpeakerVerificationNativeModule = {
  getStatus(): Promise<SpeakerVerificationStatus>;
  setThreshold(kind: SpeakerProfileKind, value: number | null): Promise<SpeakerVerificationStatus>;
  startEnrollment(kind: SpeakerProfileKind): Promise<SpeakerVerificationStatus>;
  cancelEnrollment(): Promise<SpeakerVerificationStatus>;
  deleteProfile(kind: SpeakerProfileKind): Promise<SpeakerVerificationStatus>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeModule = NativeModules.SpeakerVerification as
  | SpeakerVerificationNativeModule
  | undefined;

function requireModule() {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Bộ lọc giọng nói không khả dụng trên thiết bị');
  }
  return nativeModule;
}

export const speakerVerificationService = {
  available: Platform.OS === 'android' && nativeModule !== undefined,
  getStatus: () => requireModule().getStatus(),
  setThreshold: (kind: SpeakerProfileKind, value: number | null) =>
    requireModule().setThreshold(kind, value),
  startEnrollment: (kind: SpeakerProfileKind) =>
    requireModule().startEnrollment(kind),
  cancelEnrollment: () => requireModule().cancelEnrollment(),
  deleteProfile: (kind: SpeakerProfileKind) =>
    requireModule().deleteProfile(kind),
  onProgress(handler: (progress: number) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('speakerEnrollmentProgress', (...args) => {
      const progress = typeof args[0] === 'number' ? args[0] : 0;
      handler(Math.max(0, Math.min(100, progress)));
    });
  },
};
