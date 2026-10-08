const API_BASE_URL = __DEV__
  ? 'http://localhost:3000'
  : 'http://103.195.238.176:3000';

export type AuthResult = {
  accessToken: string;
  user: { id: string; email: string; name: string };
};

export type RealtimeAuthorization = {
  clientSecret: string;
  expiresAt: number;
  realtimeSessionId: string;
  model: string;
};

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type GeminiLiveTool = {
  functionDeclarations: GeminiFunctionDeclaration[];
};

export type GeminiLiveToken = {
  provider: 'gemini';
  token: string;
  expiresAt: string;
  newSessionExpiresAt: string;
  model: string;
  tutor: {
    conversationMode: ConversationMode;
    languageMode: 'BEGINNER' | 'INTERMEDIATE' | 'IMMERSION';
    correctionMode: 'IMPORTANT_ONLY' | 'FREQUENT' | 'ON_REQUEST';
    englishRatio: number;
    level: string;
  };
  sessionConfig: {
    systemInstruction: string;
    tools?: GeminiLiveTool[];
  };
  learningContext: {
    currentFocus: string[];
    recurringMistakes: Array<{
      pattern: string;
      occurrenceCount: number;
      suggestion: string;
    }>;
    reviewVocabulary: Array<{
      term: string;
      meaningVi: string;
      example: string;
    }>;
    recentTopics: string[];
    recentSessionSummaries: string[];
  };
};

export type ConversationMode =
  | 'FREE_CONVERSATION'
  | 'DAILY_LIFE'
  | 'WORK_SOFTWARE'
  | 'VOCABULARY_PRACTICE'
  | 'GRAMMAR_PRACTICE'
  | 'ROLE_PLAY'
  | 'PRONUNCIATION_PRACTICE';

export type TranscriptMessageInput = {
  clientMessageId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  occurredAt: string;
};

export type SessionAnalysisReport = {
  id: string;
  sessionId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  provider: string;
  model: string;
  summary: string | null;
  mainTopics: string[] | null;
  grammarIssues: Array<{
    pattern: string;
    original: string;
    suggestion: string;
    explanationVi: string;
  }> | null;
  newVocabulary: Array<{
    term: string;
    meaningVi: string;
    example: string;
  }> | null;
  strengths: Array<{ example: string; reasonVi: string }> | null;
  recommendedTopics: string[] | null;
  nextSessionFocus: string[] | null;
  errorMessage: string | null;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  token?: string;
  body?: unknown;
};

async function apiRequest<T>(
  path: string,
  { method = 'GET', token, body }: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(', ')
      : payload?.message;

    throw new Error(message ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function register(input: {
  email: string;
  password: string;
  name: string;
}) {
  return apiRequest<AuthResult>('/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function login(input: { email: string; password: string }) {
  return apiRequest<AuthResult>('/auth/login', {
    method: 'POST',
    body: input,
  });
}

export function createConversationSession(token: string) {
  return apiRequest<{ id: string }>('/sessions', {
    method: 'POST',
    token,
    body: { type: 'COMMUTE' },
  });
}

export function completeConversationSession(
  token: string,
  sessionId: string,
  messages: TranscriptMessageInput[] = [],
) {
  return apiRequest(`/sessions/${sessionId}/complete`, {
    method: 'POST',
    token,
    body: { messages },
  });
}

export function appendSessionTranscript(
  token: string,
  sessionId: string,
  messages: TranscriptMessageInput[],
) {
  return apiRequest<{ accepted: number; stored: number }>(
    `/sessions/${sessionId}/transcript`,
    {
      method: 'POST',
      token,
      body: { messages },
    },
  );
}

export function getSessionAnalysis(token: string, sessionId: string) {
  return apiRequest<SessionAnalysisReport>(`/sessions/${sessionId}/analysis`, {
    token,
  });
}

export function retrySessionAnalysis(token: string, sessionId: string) {
  return apiRequest<SessionAnalysisReport>(
    `/sessions/${sessionId}/analysis/retry`,
    { method: 'POST', token },
  );
}

export function createRealtimeAuthorization(token: string, sessionId: string) {
  return apiRequest<RealtimeAuthorization>('/realtime/session', {
    method: 'POST',
    token,
    body: { sessionId },
  });
}

export function createGeminiLiveToken(
  token: string,
  sessionId: string,
  conversationMode: ConversationMode,
) {
  return apiRequest<GeminiLiveToken>('/live/token', {
    method: 'POST',
    token,
    body: { sessionId, conversationMode },
  });
}
