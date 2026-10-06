import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useLiveConversation } from './useLiveConversation';
import { commuteAudio } from '../../../native/commute-audio';
import { liveAudioService } from '../services/liveAudio.service';

type MockTranscriptEvent = {
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
};

let mockFocus: (focus: boolean) => void;
let mockRoute: (route: { type: string; name: string }) => void;
let mockResolveConnection: () => void;
let mockTranscript: (event: MockTranscriptEvent) => void;
const mockConnect = jest.fn(
  () =>
    new Promise<void>(resolve => {
      mockResolveConnection = resolve;
    }),
);
jest.mock('../providers/GeminiLiveProvider', () => ({
  GeminiLiveProvider: jest.fn(() => ({
    connect: mockConnect,
    disconnect: jest.fn(),
    onAudio: () => () => {},
    onTranscript: (handler: (event: MockTranscriptEvent) => void) => {
      mockTranscript = handler;
      return () => {};
    },
    onVocabulary: () => () => {},
    onInterruption: () => () => {},
    onStateChange: () => () => {},
    onError: () => () => {},
  })),
}));
jest.mock('../../../api/client', () => ({
  createConversationSession: jest.fn(async () => ({ id: 'session' })),
  createGeminiLiveToken: jest.fn(async () => ({
    token: 'token',
    model: 'model',
    sessionConfig: { systemInstruction: 'Tutor' },
  })),
  appendSessionTranscript: jest.fn(async () => {}),
  completeConversationSession: jest.fn(async () => ({})),
}));
jest.mock('../../../native/commute-audio', () => ({
  commuteAudio: {
    available: true,
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    getRuntimeStatus: jest.fn(async () => ({
      networkAvailable: true,
      audioRoute: { type: 'speaker', name: 'Phone' },
    })),
    subscribeToAudioFocus: jest.fn(callback => {
      mockFocus = callback;
      return { remove: jest.fn() };
    }),
    subscribeToAudioRoute: jest.fn(callback => {
      mockRoute = callback;
      return { remove: jest.fn() };
    }),
    subscribeToNetwork: () => ({ remove: jest.fn() }),
    subscribeToServiceStopped: () => ({ remove: jest.fn() }),
  },
}));
jest.mock('../services/liveAudio.service', () => ({
  liveAudioService: {
    available: false,
    startCapture: jest.fn(async () => {}),
    startPlayback: jest.fn(async () => {}),
    stopCapture: jest.fn(async () => {}),
    stopPlayback: jest.fn(async () => {}),
    clearPlayback: jest.fn(),
  },
}));

it('does not start audio on focus or route events before Gemini setup completes', async () => {
  let hook!: ReturnType<typeof useLiveConversation>;
  function Harness() {
    hook = useLiveConversation();
    return null;
  }
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(<Harness />);
  });
  let start!: Promise<void>;
  await act(async () => {
    start = hook.start('access');
  });
  expect(commuteAudio.start).toHaveBeenCalled();
  await act(async () => {
    mockFocus(true);
    mockRoute({ type: 'speaker', name: 'Phone' });
  });
  expect(hook.status).toBe('connecting');
  expect(liveAudioService.startCapture).not.toHaveBeenCalled();
  await act(async () => {
    mockResolveConnection();
    await start;
  });
  expect(hook.status).toBe('listening');
  expect(liveAudioService.startCapture).toHaveBeenCalledTimes(1);
  await act(async () => {
    root.unmount();
  });
});

it('keeps only finalized turns in the reviewable history', async () => {
  let hook!: ReturnType<typeof useLiveConversation>;
  function Harness() {
    hook = useLiveConversation();
    return null;
  }
  let root!: Renderer.ReactTestRenderer;
  await act(async () => {
    root = Renderer.create(<Harness />);
  });
  let start!: Promise<void>;
  await act(async () => {
    start = hook.start('access');
  });
  await act(async () => {
    mockResolveConnection();
    await start;
  });

  await act(async () => {
    mockTranscript({ role: 'assistant', text: 'half said', final: false });
  });
  expect(hook.history).toHaveLength(0);

  await act(async () => {
    mockTranscript({ role: 'assistant', text: 'Get off work.', final: true });
    mockTranscript({ role: 'user', text: 'Nghĩa là gì?', final: true });
  });
  expect(hook.history.map(line => line.text)).toEqual([
    'Get off work.',
    'Nghĩa là gì?',
  ]);

  await act(async () => {
    root.unmount();
  });
});
