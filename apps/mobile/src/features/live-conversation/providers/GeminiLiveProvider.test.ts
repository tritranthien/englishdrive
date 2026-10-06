import { GeminiLiveProvider } from './GeminiLiveProvider';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onclose?: (event: { code: number; reason: string }) => void;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close(code = 1000, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value: object) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  binaryMessage(value: object) {
    const json = JSON.stringify(value);
    const bytes = Uint8Array.from(json, character => character.charCodeAt(0));
    this.onmessage?.({ data: bytes.buffer });
  }
}

describe('GeminiLiveProvider', () => {
  const OriginalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('allows slow mobile networks time to establish the socket', async () => {
    jest.useFakeTimers();
    const provider = new GeminiLiveProvider();
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor policy',
    });
    const socket = FakeWebSocket.instances[0];

    jest.advanceTimersByTime(29_000);
    expect(socket.readyState).toBe(0);
    socket.open();
    socket.message({ setupComplete: {} });

    await connected;
  });

  it('ignores a late setup response after cancelling a pending connection', async () => {
    const provider = new GeminiLiveProvider();
    const states = jest.fn();
    provider.onStateChange(states);
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor',
    });
    const rejected = connected.catch((error: Error) => error);
    const socket = FakeWebSocket.instances[0];
    await provider.disconnect();
    socket.open();
    socket.message({ setupComplete: {} });
    expect(await rejected).toEqual(new Error('Gemini Live connection cancelled'));
    expect(socket.sent).toHaveLength(0);
    expect(states).not.toHaveBeenCalledWith('listening');
  });

  it('performs setup before streaming microphone audio', async () => {
    const provider = new GeminiLiveProvider();
    const connected = provider.connect({
      token: 'short-lived-token',
      model: 'gemini-live-model',
      systemInstruction: 'You are an English tutor.',
    });
    const socket = FakeWebSocket.instances[0];

    expect(socket.url).toContain('access_token=short-lived-token');
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      setup: {
        model: 'models/gemini-live-model',
        generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: {
          parts: [{ text: 'You are an English tutor.' }],
        },
        realtimeInputConfig: {
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
          automaticActivityDetection: {
            disabled: true,
          },
        },
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: {},
      },
    });
    provider.sendAudio({
      data: 'before-setup',
      mimeType: 'audio/pcm;rate=16000',
    });
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]).setup).not.toHaveProperty('tools');

    socket.binaryMessage({ setupComplete: {} });
    await connected;
    provider.startAudioActivity();
    expect(JSON.parse(socket.sent[1])).toEqual({
      realtimeInput: { activityStart: {} },
    });
    provider.sendAudio({ data: 'cGNt', mimeType: 'audio/pcm;rate=16000' });
    expect(JSON.parse(socket.sent[2])).toEqual({
      realtimeInput: {
        audio: { data: 'cGNt', mimeType: 'audio/pcm;rate=16000' },
      },
    });
    provider.endAudioActivity();
    expect(JSON.parse(socket.sent[3])).toEqual({
      realtimeInput: { activityEnd: {} },
    });
    provider.endAudioActivity();
    expect(socket.sent).toHaveLength(4);
  });

  it('emits audio and clears playback through the interruption boundary', async () => {
    const provider = new GeminiLiveProvider();
    const audio = jest.fn();
    const interrupted = jest.fn();
    provider.onAudio(audio);
    provider.onInterruption(interrupted);
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor policy',
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ setupComplete: {} });
    await connected;

    socket.message({
      serverContent: {
        interrupted: true,
        modelTurn: {
          parts: [
            {
              inlineData: {
                data: 'YXVkaW8=',
                mimeType: 'audio/pcm;rate=24000',
              },
            },
          ],
        },
      },
    });

    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(audio).not.toHaveBeenCalled();
  });

  it('combines output transcription chunks into one finalized turn', async () => {
    const provider = new GeminiLiveProvider();
    const transcripts = jest.fn();
    provider.onTranscript(transcripts);
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor policy',
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ setupComplete: {} });
    await connected;

    socket.message({
      serverContent: { outputTranscription: { text: 'Hello' } },
    });
    socket.message({
      serverContent: { outputTranscription: { text: ' there.' } },
    });
    socket.message({ serverContent: { generationComplete: true } });

    expect(transcripts).toHaveBeenLastCalledWith({
      role: 'assistant',
      text: 'Hello there.',
      final: true,
    });
  });

  it('declares tools in setup and answers a vocabulary tool call', async () => {
    const provider = new GeminiLiveProvider();
    const vocabulary = jest.fn();
    provider.onVocabulary(vocabulary);
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor policy',
      tools: [
        {
          functionDeclarations: [
            { name: 'show_vocabulary', description: 'Show a word.' },
          ],
        },
      ],
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      setup: {
        tools: [{ functionDeclarations: [{ name: 'show_vocabulary' }] }],
      },
    });
    socket.message({ setupComplete: {} });
    await connected;

    socket.message({
      toolCall: {
        functionCalls: [
          {
            id: 'fc_1',
            name: 'show_vocabulary',
            args: {
              term: 'get off work',
              meaningVi: 'tan làm',
              example: 'I get off work at 5 PM.',
            },
          },
        ],
      },
    });

    expect(vocabulary).toHaveBeenCalledWith({
      term: 'get off work',
      meaningVi: 'tan làm',
      example: 'I get off work at 5 PM.',
    });
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toEqual({
      toolResponse: {
        functionResponses: [
          { id: 'fc_1', name: 'show_vocabulary', response: { result: 'ok' } },
        ],
      },
    });
  });

  it('answers an unrecognized tool call so the turn is never left open', async () => {
    const provider = new GeminiLiveProvider();
    const vocabulary = jest.fn();
    provider.onVocabulary(vocabulary);
    const connected = provider.connect({
      token: 'token',
      model: 'model',
      systemInstruction: 'Tutor policy',
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ setupComplete: {} });
    await connected;

    socket.message({
      toolCall: { functionCalls: [{ id: 'fc_9', name: 'some_other_tool' }] },
    });

    expect(vocabulary).not.toHaveBeenCalled();
    expect(JSON.parse(socket.sent[socket.sent.length - 1])).toEqual({
      toolResponse: {
        functionResponses: [
          { id: 'fc_9', name: 'some_other_tool', response: { result: 'ok' } },
        ],
      },
    });
  });

  it('exposes a resumption handle and requests reconnect after transport loss', async () => {
    const provider = new GeminiLiveProvider();
    const states = jest.fn();
    provider.onStateChange(states);
    const connected = provider.connect({
      token: 'token-one',
      model: 'model',
      systemInstruction: 'Tutor policy',
    });
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.open();
    firstSocket.message({ setupComplete: {} });
    await connected;
    firstSocket.message({
      sessionResumptionUpdate: {
        resumable: true,
        newHandle: 'resume-handle',
      },
    });

    expect(provider.getResumeHandle()).toBe('resume-handle');
    firstSocket.close();
    expect(states).toHaveBeenLastCalledWith('reconnecting');

    const reconnected = provider.connect({
      token: 'token-two',
      model: 'model',
      systemInstruction: 'Tutor policy',
      resumeHandle: provider.getResumeHandle(),
    });
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();
    expect(JSON.parse(secondSocket.sent[0])).toMatchObject({
      setup: { sessionResumption: { handle: 'resume-handle' } },
    });
    secondSocket.message({ setupComplete: {} });
    await reconnected;
  });
});
