export type LiveConversationState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'thinking'
  | 'ai-speaking'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type PcmAudioChunk = {
  data: string;
  mimeType: string;
};

export type TranscriptEvent = {
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
};

export type LiveSessionConfig = {
  token: string;
  model: string;
  systemInstruction: string;
  resumeHandle?: string;
};

export interface LiveConversationProvider {
  connect(config: LiveSessionConfig): Promise<void>;
  sendAudio(chunk: PcmAudioChunk): void;
  endAudioStream(): void;
  disconnect(): Promise<void>;
  interrupt(): void;
  getResumeHandle(): string | undefined;
  onAudio(handler: (chunk: PcmAudioChunk) => void): () => void;
  onTranscript(handler: (event: TranscriptEvent) => void): () => void;
  onInterruption(handler: () => void): () => void;
  onStateChange(handler: (state: LiveConversationState) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
}
