import type {
  LiveConversationProvider,
  LiveConversationState,
  LiveSessionConfig,
  PcmAudioChunk,
  TranscriptEvent,
} from '../types/liveConversation.types';

const GEMINI_LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const CONNECTION_TIMEOUT_MS = 45_000;
const SETUP_RESPONSE_TIMEOUT_MS = 15_000;

type GeminiPart = {
  inlineData?: { data?: string; mimeType?: string };
  inline_data?: { data?: string; mime_type?: string };
};

type GeminiServerMessage = {
  setupComplete?: object;
  serverContent?: {
    interrupted?: boolean;
    generationComplete?: boolean;
    turnComplete?: boolean;
    inputTranscription?: { text?: string };
    interimInputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: GeminiPart[] };
  };
  sessionResumptionUpdate?: {
    resumable?: boolean;
    newHandle?: string;
  };
  goAway?: { timeLeft?: string };
  error?: { code?: number; message?: string; status?: string };
};

function debugEvent(event: string, details?: unknown) {
  if (__DEV__) console.info(`[GeminiLive] ${event}`, details ?? '');
}

function readBlobAsText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Gemini Live Blob did not contain text'));
    reader.onerror = () =>
      reject(new Error('Could not decode Gemini Live Blob'));
    reader.readAsText(blob);
  });
}

/* eslint-disable no-bitwise -- UTF-8 decoding requires byte masks and shifts. */
function decodeUtf8(bytes: Uint8Array) {
  let result = '';
  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index++];
    let codePoint: number;
    if (first < 0x80) {
      codePoint = first;
    } else if (first < 0xe0) {
      codePoint = ((first & 0x1f) << 6) | (bytes[index++] & 0x3f);
    } else if (first < 0xf0) {
      codePoint =
        ((first & 0x0f) << 12) |
        ((bytes[index++] & 0x3f) << 6) |
        (bytes[index++] & 0x3f);
    } else {
      codePoint =
        ((first & 0x07) << 18) |
        ((bytes[index++] & 0x3f) << 12) |
        ((bytes[index++] & 0x3f) << 6) |
        (bytes[index++] & 0x3f);
    }
    if (codePoint <= 0xffff) {
      result += String.fromCharCode(codePoint);
    } else {
      codePoint -= 0x10000;
      result += String.fromCharCode(
        0xd800 + (codePoint >> 10),
        0xdc00 + (codePoint & 0x3ff),
      );
    }
  }
  return result;
}
/* eslint-enable no-bitwise */

async function messageDataAsText(data: unknown) {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return readBlobAsText(data);
  if (data instanceof ArrayBuffer) return decodeUtf8(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return decodeUtf8(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  throw new Error(`Gemini Live returned unsupported ${typeof data} data`);
}

export class GeminiLiveProvider implements LiveConversationProvider {
  private socket?: WebSocket;
  private cancelPending?: () => void;
  private setupComplete = false;
  private intentionalClose = false;
  private resumeHandle?: string;
  private outputTranscript = '';
  private messageQueue: Promise<void> = Promise.resolve();
  private readonly audioHandlers = new Set<(chunk: PcmAudioChunk) => void>();
  private readonly transcriptHandlers = new Set<
    (event: TranscriptEvent) => void
  >();
  private readonly interruptionHandlers = new Set<() => void>();
  private readonly stateHandlers = new Set<
    (state: LiveConversationState) => void
  >();
  private readonly errorHandlers = new Set<(error: Error) => void>();

  connect(config: LiveSessionConfig): Promise<void> {
    this.cancelPending?.();
    const previousSocket = this.socket;
    if (previousSocket) {
      previousSocket.onopen = null;
      previousSocket.onmessage = null;
      previousSocket.onerror = null;
      previousSocket.onclose = null;
      previousSocket.close();
    }
    this.intentionalClose = false;
    this.setupComplete = false;
    this.outputTranscript = '';
    this.messageQueue = Promise.resolve();
    this.emitState('connecting');
    const url = `${GEMINI_LIVE_ENDPOINT}?access_token=${encodeURIComponent(config.token)}`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(url);
      // Gemini sends protocol JSON in WebSocket binary frames. React Native's
      // Blob/FileReader bridge can stall for these frames on some Android
      // builds, while ArrayBuffer decoding stays synchronous and predictable.
      (
        socket as WebSocket & { binaryType: 'arraybuffer' | 'blob' }
      ).binaryType = 'arraybuffer';
      this.socket = socket;
      let timeout: ReturnType<typeof setTimeout>;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelPending = undefined;
        if (this.socket === socket) this.socket = undefined;
        // Android may deliver onopen after close() while connecting. Keep the
        // onopen guard, but ignore late messages from this failed attempt.
        socket.close();
        reject(error);
      };
      this.cancelPending = () =>
        fail(new Error('Gemini Live connection cancelled'));
      const armTimeout = (duration: number, message: string) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (settled) return;
          const error = new Error(message);
          fail(error);
          this.emitError(error);
        }, duration);
      };
      armTimeout(CONNECTION_TIMEOUT_MS, 'Gemini Live connection timed out');

      socket.onopen = () => {
        if (settled || this.socket !== socket) {
          socket.close();
          return;
        }
        debugEvent('socket open');
        armTimeout(
          SETUP_RESPONSE_TIMEOUT_MS,
          'Gemini Live setup response timed out',
        );
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${config.model}`,
              generationConfig: { responseModalities: ['AUDIO'] },
              systemInstruction: {
                parts: [{ text: config.systemInstruction }],
              },
              realtimeInputConfig: {
                activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
                turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                  endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                  prefixPaddingMs: 160,
                  silenceDurationMs: 800,
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              contextWindowCompression: { slidingWindow: {} },
              sessionResumption: config.resumeHandle
                ? { handle: config.resumeHandle }
                : {},
            },
          }),
        );
      };
      const processMessage = (raw: string) => {
        if (this.socket !== socket) return;
        let message: GeminiServerMessage;
        try {
          message = JSON.parse(raw) as GeminiServerMessage;
        } catch {
          debugEvent('invalid JSON message');
          return;
        }
        if (message.error) {
          const error = new Error(
            message.error.message ??
              message.error.status ??
              'Gemini Live protocol error',
          );
          this.emitError(error);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(error);
          }
          socket.close();
          return;
        }
        if (message.setupComplete) {
          debugEvent('setup complete');
          this.setupComplete = true;
          this.emitState('listening');
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            this.cancelPending = undefined;
            resolve();
          }
        }
        this.handleMessage(message);
      };
      socket.onmessage = event => {
        if (typeof event.data === 'string') {
          processMessage(event.data);
          return;
        }
        this.messageQueue = this.messageQueue
          .then(() => messageDataAsText(event.data))
          .then(processMessage)
          .catch((cause: unknown) => {
            const error =
              cause instanceof Error
                ? cause
                : new Error('Could not process Gemini Live message');
            debugEvent('message decode error', error.message);
            this.emitError(error);
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              reject(error);
            }
          });
      };
      socket.onerror = () => {
        debugEvent('socket error');
        if (this.socket !== socket) return;
        const error = new Error('Gemini Live WebSocket error');
        this.emitError(error);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      };
      socket.onclose = event => {
        if (this.socket !== socket) return;
        debugEvent('socket closed', {
          code: event.code,
          reason: event.reason,
        });
        clearTimeout(timeout);
        this.flushOutputTranscript();
        this.setupComplete = false;
        if (!settled) {
          settled = true;
          reject(new Error('Gemini Live closed before setup completed'));
        }
        this.emitState(this.intentionalClose ? 'disconnected' : 'reconnecting');
      };
    });
  }

  sendAudio(chunk: PcmAudioChunk) {
    if (!this.setupComplete || this.socket?.readyState !== WebSocket.OPEN)
      return;
    this.socket.send(
      JSON.stringify({
        realtimeInput: {
          audio: { data: chunk.data, mimeType: chunk.mimeType },
        },
      }),
    );
  }

  endAudioStream() {
    if (!this.setupComplete || this.socket?.readyState !== WebSocket.OPEN)
      return;
    this.socket.send(
      JSON.stringify({ realtimeInput: { audioStreamEnd: true } }),
    );
  }

  interrupt() {
    this.interruptionHandlers.forEach(handler => handler());
  }

  async disconnect() {
    this.intentionalClose = true;
    this.cancelPending?.();
    this.flushOutputTranscript();
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) {
      this.endAudioStream();
      socket.close(1000, 'Session ended');
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    this.socket = undefined;
    this.setupComplete = false;
    this.emitState('disconnected');
  }

  getResumeHandle() {
    return this.resumeHandle;
  }

  onAudio(handler: (chunk: PcmAudioChunk) => void) {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  onTranscript(handler: (event: TranscriptEvent) => void) {
    this.transcriptHandlers.add(handler);
    return () => this.transcriptHandlers.delete(handler);
  }

  onInterruption(handler: () => void) {
    this.interruptionHandlers.add(handler);
    return () => this.interruptionHandlers.delete(handler);
  }

  onStateChange(handler: (state: LiveConversationState) => void) {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  private handleMessage(message: GeminiServerMessage) {
    const resumption = message.sessionResumptionUpdate;
    if (resumption?.resumable && resumption.newHandle) {
      this.resumeHandle = resumption.newHandle;
    }
    if (message.goAway) {
      this.socket?.close(1012, 'Gemini requested reconnect');
    }

    const content = message.serverContent;
    if (!content) return;
    if (content.outputTranscription?.text) {
      const next = content.outputTranscription.text;
      if (next.startsWith(this.outputTranscript)) {
        this.outputTranscript = next;
      } else if (!this.outputTranscript.endsWith(next)) {
        this.outputTranscript += next;
      }
      this.emitTranscript({
        role: 'assistant',
        text: this.outputTranscript,
        final: false,
      });
    }
    if (content.interrupted) {
      debugEvent('response interrupted');
      this.flushOutputTranscript();
      this.interruptionHandlers.forEach(handler => handler());
      this.emitState('user-speaking');
      return;
    }
    if (content.interimInputTranscription?.text) {
      this.emitTranscript({
        role: 'user',
        text: content.interimInputTranscription.text,
        final: false,
      });
      this.emitState('user-speaking');
    }
    if (content.inputTranscription?.text) {
      this.emitTranscript({
        role: 'user',
        text: content.inputTranscription.text,
        final: true,
      });
      this.emitState('thinking');
    }
    content.modelTurn?.parts?.forEach(part => {
      const data = part.inlineData?.data ?? part.inline_data?.data;
      const mimeType =
        part.inlineData?.mimeType ??
        part.inline_data?.mime_type ??
        'audio/pcm;rate=24000';
      if (data) {
        this.emitState('ai-speaking');
        this.audioHandlers.forEach(handler => handler({ data, mimeType }));
      }
    });
    if (content.generationComplete || content.turnComplete) {
      this.flushOutputTranscript();
    }
    if (content.turnComplete) this.emitState('listening');
  }

  private flushOutputTranscript() {
    const text = this.outputTranscript.trim();
    this.outputTranscript = '';
    if (text) this.emitTranscript({ role: 'assistant', text, final: true });
  }

  private emitTranscript(event: TranscriptEvent) {
    this.transcriptHandlers.forEach(handler => handler(event));
  }

  private emitState(state: LiveConversationState) {
    this.stateHandlers.forEach(handler => handler(state));
  }

  private emitError(error: Error) {
    debugEvent('error', error.message);
    this.errorHandlers.forEach(handler => handler(error));
  }
}
