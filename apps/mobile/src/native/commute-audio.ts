import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type CommuteAudioNativeModule = {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  getAssistantStatus(): Promise<AssistantStatus>;
  requestAssistantRole(): Promise<boolean>;
  armWakeWord(): Promise<void>;
  disarmWakeWord(): Promise<void>;
  getRuntimeStatus(): Promise<CommuteRuntimeStatus>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export type AssistantStatus = {
  roleAvailable: boolean;
  isDefaultAssistant: boolean;
  onDeviceWakeAvailable: boolean;
  wakeArmed: boolean;
};

export type CommuteAudioRoute = {
  type: 'bluetooth' | 'wired' | 'speaker' | 'earpiece' | 'other';
  name: string;
};

export type CommuteRuntimeStatus = {
  networkAvailable: boolean;
  audioRoute: CommuteAudioRoute;
};

const nativeModule = NativeModules.CommuteAudio as
  | CommuteAudioNativeModule
  | undefined;

function requireNativeModule(): CommuteAudioNativeModule {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error(
      'Commute audio is available only in the Android native app',
    );
  }
  return nativeModule;
}

export const commuteAudio = {
  available: Platform.OS === 'android' && nativeModule !== undefined,
  start: () => requireNativeModule().start(),
  stop: () => nativeModule?.stop() ?? Promise.resolve(),
  isRunning: () => requireNativeModule().isRunning(),
  getAssistantStatus: () => requireNativeModule().getAssistantStatus(),
  requestAssistantRole: () => requireNativeModule().requestAssistantRole(),
  armWakeWord: () => requireNativeModule().armWakeWord(),
  disarmWakeWord: () => requireNativeModule().disarmWakeWord(),
  getRuntimeStatus: () => requireNativeModule().getRuntimeStatus(),
  subscribeToAudioFocus(listener: (hasFocus: boolean) => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('commuteAudioFocusChanged', (...args) => {
      listener(args[0] === true);
    });
  },
  subscribeToServiceStopped(listener: () => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('commuteAudioStopped', listener);
  },
  subscribeToNetwork(listener: (available: boolean) => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('commuteNetworkChanged', (...args) => {
      listener(args[0] === true);
    });
  },
  subscribeToAudioRoute(listener: (route: CommuteAudioRoute) => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('commuteAudioRouteChanged', (...args) => {
      const value = args[0] as CommuteAudioRoute | undefined;
      if (value?.type && value.name) listener(value);
    });
  },
  subscribeToWakeDetected(listener: () => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('englishDriveWakeDetected', listener);
  },
  subscribeToWakeState(listener: (armed: boolean) => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('englishDriveWakeStateChanged', (...args) => {
      listener(args[0] === true);
    });
  },
  subscribeToWakeError(listener: (message: string) => void) {
    const module = requireNativeModule();
    const emitter = new NativeEventEmitter(module);
    return emitter.addListener('englishDriveWakeError', (...args) => {
      listener(typeof args[0] === 'string' ? args[0] : 'Wake detection failed');
    });
  },
};
