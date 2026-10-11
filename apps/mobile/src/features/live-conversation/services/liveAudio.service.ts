import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { PcmAudioChunk } from '../types/liveConversation.types';
import type { SpeakerMatchEvent } from '../../speaker-verification/speakerVerification.service';

type LiveAudioNativeModule = {
  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  startPlayback(): Promise<void>;
  enqueuePlayback(base64Pcm: string): void;
  clearPlayback(): void;
  stopPlayback(): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const nativeModule = NativeModules.LiveAudio as
  | LiveAudioNativeModule
  | undefined;

function requireModule() {
  if (Platform.OS !== 'android' || !nativeModule) {
    throw new Error('Âm thanh trực tiếp không khả dụng trên thiết bị');
  }
  return nativeModule;
}

export const liveAudioService = {
  available: Platform.OS === 'android' && nativeModule !== undefined,
  startCapture: () => requireModule().startCapture(),
  stopCapture: () => nativeModule?.stopCapture() ?? Promise.resolve(),
  startPlayback: () => requireModule().startPlayback(),
  enqueuePlayback: (chunk: PcmAudioChunk) =>
    requireModule().enqueuePlayback(chunk.data),
  clearPlayback: () => nativeModule?.clearPlayback(),
  stopPlayback: () => nativeModule?.stopPlayback() ?? Promise.resolve(),
  onAudioChunk(handler: (chunk: PcmAudioChunk) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('liveAudioChunk', (...args) => {
      const event = args[0] as PcmAudioChunk | undefined;
      if (event?.data && event.mimeType) handler(event);
    });
  },
  onActivity(handler: (speaking: boolean) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('liveAudioActivity', (...args) => {
      handler(args[0] === true);
    });
  },
  onError(handler: (error: Error) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('liveAudioError', (...args) => {
      handler(
        new Error(typeof args[0] === 'string' ? args[0] : 'Lỗi âm thanh trên thiết bị'),
      );
    });
  },
  onSpeakerMatch(handler: (event: SpeakerMatchEvent) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('liveSpeakerMatch', (...args) => {
      const event = args[0] as SpeakerMatchEvent | undefined;
      if (event) handler(event);
    });
  },
  onFilterBypassed(handler: (bypassed: boolean) => void) {
    const emitter = new NativeEventEmitter(requireModule());
    return emitter.addListener('liveAudioFilterBypassed', (...args) => handler(args[0] === true));
  },
};
