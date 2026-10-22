export type ChatCharacterInput = {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  bio: string;
  personality: string;
  interests: string;
  speakingStyle: string;
  color: string;
};
export type ChatCharacter = ChatCharacterInput & { id: string; templateId?: string | null };
export type ChatPreferences = {
  enabled: boolean;
  autoCorrect: boolean;
  minMinutes: number;
  maxMinutes: number;
  dailyLimit: number;
  quietStart: number;
  quietEnd: number;
  timezone: string;
};
export type ChatMessage = {
  id: string;
  threadId: string;
  sequence: number;
  clientMessageId: string | null;
  characterId: string | null;
  role: 'USER' | 'CHARACTER';
  content: string;
  createdAt: string;
};
export type ChatThread = {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  title: string;
  romance: boolean;
  archived: boolean;
  muted: boolean;
  proactiveEnabled: boolean;
  minMinutes: number | null;
  maxMinutes: number | null;
  lastSequence: number;
  lastReadSequence: number;
  updatedAt: string;
  members: Array<{ characterId: string; character: ChatCharacter }>;
  messages?: ChatMessage[];
  unread?: number;
};
export type ChatMessagePage = {
  items: ChatMessage[];
  hasMore: boolean;
  thread: ChatThread;
  replyStatus: 'IDLE' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  replyError: string | null;
};
export type ChatVocabularyLookup = {
  term: string;
  meaningVi: string;
  pronunciation: string;
  partOfSpeech: string;
  explanation: string;
  example: string;
};

export type ChatHelpResult = {
  text: string;
  vocabulary?: Array<{ term: string; meaningVi: string; example: string }>;
};
