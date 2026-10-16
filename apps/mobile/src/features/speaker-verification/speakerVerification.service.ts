import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type SpeakerVerificationStatus = {
  enrollment?: EnrollmentProgress;
  configured: boolean;
  phoneEnrolled: boolean;
  headsetEnrolled: boolean;
  needsReenrollment: boolean;
  enrolling: boolean;
  enrollingKind?: SpeakerProfileKind;
  currentRouteKind: SpeakerProfileKind;
  thresholds: Record<SpeakerProfileKind, SpeakerThresholdSettings>;
};

export type EnrollmentProgress = {
  progress: number;
  phase: 'preparing' | 'listening' | 'processing' | 'saving';
  capturedMs: number;
  targetMs: number;
  remainingMs: number;
  level: number;
  speechDetected: boolean;
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
  decision:
    | 'waiting'
    | 'matching'
    | 'accepted'
    | 'rejected'
    | 'continuity'
    | 'bypassed'
    | 'off';
  reason?: string | null;
};

export type SpeakerProfileKind = 'phone' | 'headset';

type SpeakerVerificationNativeModule = {
  getStatus(): Promise<SpeakerVerificationStatus>;
  setThreshold(
    kind: SpeakerProfileKind,
    value: number | null,
  ): Promise<SpeakerVerificationStatus>;
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
  onProgress(handler: (progress: EnrollmentProgress) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('speakerEnrollmentProgress', (...args) => {
      const event = args[0];
      if (event && typeof event === 'object') {
        handler(event as EnrollmentProgress);
      } else if (typeof event === 'number') {
        handler({
          progress: Math.max(0, Math.min(100, event)),
          phase: 'listening',
          capturedMs: event * 100,
          targetMs: 10000,
          remainingMs: 90000,
          level: 0,
          speechDetected: event > 0,
        });
      }
    });
  },
};
