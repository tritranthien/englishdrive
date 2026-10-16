import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useSpeakerVerification } from './useSpeakerVerification';
import {
  speakerVerificationService,
  type EnrollmentProgress,
} from './speakerVerification.service';

jest.mock('./speakerVerification.service', () => ({
  speakerVerificationService: {
    available: true,
    getStatus: jest.fn(),
    startEnrollment: jest.fn(),
    cancelEnrollment: jest.fn(),
    onProgress: jest.fn(),
  },
}));
jest.mock('../live-conversation/services/liveAudio.service', () => ({
  liveAudioService: { available: false },
}));

jest.setTimeout(30000);
const originalOS = Platform.OS;
beforeAll(() => { Platform.OS = 'android'; });
afterAll(() => { Platform.OS = originalOS; });

const idle = {
  configured: true,
  enrolling: false,
  phoneEnrolled: false,
  headsetEnrolled: false,
  needsReenrollment: false,
  currentRouteKind: 'phone',
  thresholds: {},
};
let hook!: ReturnType<typeof useSpeakerVerification>;
let root: Renderer.ReactTestRenderer;
let report: (event: EnrollmentProgress) => void;
function Harness() {
  hook = useSpeakerVerification();
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (speakerVerificationService.getStatus as jest.Mock).mockResolvedValue(idle);
  (speakerVerificationService.onProgress as jest.Mock).mockImplementation(
    handler => {
      report = handler;
      return { remove: jest.fn() };
    },
  );
  await act(async () => {
    root = Renderer.create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  jest.restoreAllMocks();
});

it('shows live silence feedback and only announces success after saving', async () => {
  const request = deferred<any>();
  (speakerVerificationService.startEnrollment as jest.Mock).mockReturnValue(
    request.promise,
  );
  let task!: Promise<void>;
  await act(async () => {
    task = hook.enroll('phone');
  });
  expect(hook.status?.enrolling).toBe(true);
  expect(hook.enrollment?.phase).toBe('preparing');
  await act(async () =>
    report({
      progress: 24,
      phase: 'listening',
      capturedMs: 2400,
      targetMs: 10000,
      remainingMs: 78000,
      level: 0.02,
      speechDetected: false,
    }),
  );
  expect(hook.progress).toBe(24);
  expect(hook.enrollment?.speechDetected).toBe(false);
  expect(hook.enrollment?.remainingMs).toBe(78000);
  expect(Alert.alert).not.toHaveBeenCalled();
  const saved = { ...idle, phoneEnrolled: true };
  (speakerVerificationService.getStatus as jest.Mock).mockResolvedValue(saved);
  await act(async () => {
    request.resolve(saved);
    await task;
  });
  expect(hook.progress).toBe(100);
  expect(hook.status?.enrolling).toBe(false);
  expect(hook.notice).toContain('thành công');
  expect(Alert.alert).toHaveBeenCalledWith(
    'Ghi mẫu giọng thành công',
    expect.any(String),
  );
});

it('explains a timeout and unlocks enrollment for another attempt', async () => {
  (speakerVerificationService.startEnrollment as jest.Mock).mockRejectedValue(
    new Error('Voice enrollment timed out.'),
  );
  await act(async () => {
    await hook.enroll('phone');
  });
  expect(hook.error).toContain('Chưa thu đủ 10 giây');
  expect(hook.status?.enrolling).toBe(false);
  expect(hook.notice).toBeUndefined();
  await act(async () => {
    await hook.enroll('phone');
  });
  expect(speakerVerificationService.startEnrollment).toHaveBeenCalledTimes(2);
});

it('does not report a cancelled recording as a failure', async () => {
  const request = deferred<any>();
  (speakerVerificationService.startEnrollment as jest.Mock).mockReturnValue(
    request.promise,
  );
  (speakerVerificationService.cancelEnrollment as jest.Mock).mockImplementation(
    async () => {
      request.reject(new Error('Voice enrollment was cancelled'));
      return idle;
    },
  );
  let task!: Promise<void>;
  await act(async () => {
    task = hook.enroll('phone');
  });
  await act(async () => {
    await hook.cancel();
    await task;
  });
  expect(hook.error).toBeUndefined();
  expect(hook.notice).toContain('Đã hủy');
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('ignores an old status refresh while recording and prevents duplicate starts', async () => {
  const request = deferred<any>();
  const stale = deferred<any>();
  (speakerVerificationService.startEnrollment as jest.Mock).mockReturnValue(
    request.promise,
  );
  (speakerVerificationService.getStatus as jest.Mock).mockReturnValueOnce(
    stale.promise,
  );
  let refresh!: Promise<void>;
  let task!: Promise<void>;
  await act(async () => {
    refresh = hook.refresh();
    task = hook.enroll('phone');
  });
  await act(async () => {
    stale.resolve(idle);
    await refresh;
    await hook.enroll('phone');
  });
  expect(hook.status?.enrolling).toBe(true);
  expect(speakerVerificationService.startEnrollment).toHaveBeenCalledTimes(1);
  await act(async () => {
    request.reject(new Error('test failure'));
    await task;
  });
});
