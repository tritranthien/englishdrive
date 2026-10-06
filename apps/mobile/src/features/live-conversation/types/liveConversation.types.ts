import type { GeminiLiveTool } from '../../../api/client';

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

export type TranscriptLine = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
};

export type VocabularyHighlight = {
  term: string;
  meaningVi: string;
  example?: string;
};

export type LiveSessionConfig = {
  token: string;
  model: string;
  systemInstruction: string;
  resumeHandle?: string;
  tools?: GeminiLiveTool[];
};

export interface LiveConversationProvider {
  connect(config: LiveSessionConfig): Promise<void>;
  startAudioActivity(): void;
  sendAudio(chunk: PcmAudioChunk): void;
  endAudioActivity(): void;
  disconnect(): Promise<void>;
  interrupt(): void;
  getResumeHandle(): string | undefined;
  onAudio(handler: (chunk: PcmAudioChunk) => void): () => void;
  onTranscript(handler: (event: TranscriptEvent) => void): () => void;
  onVocabulary(handler: (highlight: VocabularyHighlight) => void): () => void;
  onInterruption(handler: () => void): () => void;
  onStateChange(handler: (state: LiveConversationState) => void): () => void;
  onError(handler: (error: Error) => void): () => void;
}
