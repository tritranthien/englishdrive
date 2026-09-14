import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type SpeakerVerificationStatus = {
  configured: boolean;
  enrolled: boolean;
  enrolling: boolean;
};

type SpeakerVerificationNativeModule = {
  getStatus(): Promise<SpeakerVerificationStatus>;
  startEnrollment(): Promise<SpeakerVerificationStatus>;
  cancelEnrollment(): Promise<SpeakerVerificationStatus>;
  deleteProfile(): Promise<SpeakerVerificationStatus>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeModule = NativeModules.SpeakerVerification as
  | SpeakerVerificationNativeModule
  | undefined;

function requireModule() {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Native speaker verification is unavailable');
  }
  return nativeModule;
}

export const speakerVerificationService = {
  available: Platform.OS === 'android' && nativeModule !== undefined,
  getStatus: () => requireModule().getStatus(),
  startEnrollment: () => requireModule().startEnrollment(),
  cancelEnrollment: () => requireModule().cancelEnrollment(),
  deleteProfile: () => requireModule().deleteProfile(),
  onProgress(handler: (progress: number) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('speakerEnrollmentProgress', (...args) => {
      const progress = typeof args[0] === 'number' ? args[0] : 0;
      handler(Math.max(0, Math.min(100, progress)));
    });
  },
};
