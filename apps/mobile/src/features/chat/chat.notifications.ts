import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { chatApi } from './chat.api';
export type PushState = {
  configured: boolean;
  permissionGranted: boolean;
  token?: string;
  installationId: string;
};
type PushModule = {
  configure(userId: string): Promise<PushState>;
  clear(): Promise<void>;
  consumeOpen(userId: string): Promise<string | null>;
  setVisibleThread(threadId: string | null): void;
  addListener(name: string): void;
  removeListeners(count: number): void;
};
const native = NativeModules.ChatNotifications as PushModule | undefined;
let clearing = false;
let epoch = 0;
const registrations = new Set<Promise<PushState | undefined>>();
export const chatNotifications = {
  register(
    userId: string,
    token: string,
    requestPermission = false,
  ): Promise<PushState | undefined> {
    if (!native || clearing) return Promise.resolve(undefined);
    const currentEpoch = epoch;
    const task = (async () => {
      if (
        requestPermission &&
        Platform.OS === 'android' &&
        Number(Platform.Version) >= 33
      ) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }
      const state = await native.configure(userId);
      if (currentEpoch !== epoch) return undefined;
      if (state.token)
        await chatApi.device(token, {
          token: state.token,
          installationId: state.installationId,
        });
      return state;
    })();
    registrations.add(task);
    void task.finally(() => registrations.delete(task)).catch(() => {});
    return task;
  },
  async clear(token?: string, userId?: string) {
    if (!native) return;
    clearing = true;
    epoch += 1;
    try {
      await Promise.allSettled([...registrations]);
      if (token && userId) {
        const state = await native.configure(userId);
        await chatApi.removeDevice(token, state.installationId);
      }
    } finally {
      try {
        await native.clear();
      } finally {
        clearing = false;
      }
    }
  },
  consumeOpen: (userId: string) =>
    native?.consumeOpen(userId) ?? Promise.resolve(null),
  setVisibleThread: (id: string | null) => native?.setVisibleThread(id),
  subscribe(handler: () => void) {
    if (!native) return { remove() {} };
    const emitter = new NativeEventEmitter(native);
    const open = emitter.addListener('chatNotificationOpen', handler);
    const update = emitter.addListener('chatNotificationReceived', handler);
    const token = emitter.addListener('chatPushToken', handler);
    return {
      remove() {
        open.remove();
        update.remove();
        token.remove();
      },
    };
  },
};
