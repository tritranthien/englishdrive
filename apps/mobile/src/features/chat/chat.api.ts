import { apiRequest } from '../../api/client';
import type {
  ChatCharacter,
  ChatCharacterInput,
  ChatMessage,
  ChatMessagePage,
  ChatPreferences,
  ChatThread,
} from '../../../../../packages/shared/src/chat';
export type {
  ChatCharacter,
  ChatCharacterInput,
  ChatMessage,
  ChatMessagePage,
  ChatPreferences,
  ChatThread,
} from '../../../../../packages/shared/src/chat';
export const chatApi = {
  status: (token: string) =>
    apiRequest<{ pushConfigured: boolean; proactiveEnabled: boolean }>(
      '/chat/status',
      { token },
    ),
  catalog: (token: string) =>
    apiRequest<ChatCharacter[]>('/chat/catalog', { token }),
  characters: (token: string) =>
    apiRequest<ChatCharacter[]>('/chat/characters', { token }),
  addCharacter: (
    token: string,
    body: ChatCharacterInput | { templateId: string },
  ) =>
    apiRequest<ChatCharacter>('/chat/characters', {
      token,
      method: 'POST',
      body,
    }),
  editCharacter: (token: string, id: string, body: ChatCharacterInput) =>
    apiRequest<ChatCharacter>(`/chat/characters/${id}`, {
      token,
      method: 'PATCH',
      body,
    }),
  threads: (token: string) =>
    apiRequest<ChatThread[]>('/chat/threads', { token }),
  thread: (token: string, id: string) =>
    apiRequest<ChatThread>(`/chat/threads/${id}`, { token }),
  create: (
    token: string,
    body: { kind: 'DIRECT' | 'GROUP'; title: string; characterIds: string[] },
  ) => apiRequest<ChatThread>('/chat/threads', { token, method: 'POST', body }),
  update: (
    token: string,
    id: string,
    body: Partial<
      Pick<
        ChatThread,
        | 'title'
        | 'romance'
        | 'archived'
        | 'muted'
        | 'proactiveEnabled'
        | 'minMinutes'
        | 'maxMinutes'
      >
    > & { characterIds?: string[] },
  ) =>
    apiRequest<ChatThread>(`/chat/threads/${id}`, {
      token,
      method: 'PATCH',
      body,
    }),
  messages: (token: string, id: string, query = '') =>
    apiRequest<ChatMessagePage>(`/chat/threads/${id}/messages${query}`, {
      token,
    }),
  send: (token: string, id: string, clientMessageId: string, content: string) =>
    apiRequest<ChatMessage>(`/chat/threads/${id}/messages`, {
      token,
      method: 'POST',
      body: { clientMessageId, content },
      timeoutMs: 15000,
    }),
  read: (token: string, id: string, sequence: number) =>
    apiRequest(`/chat/threads/${id}/read`, {
      token,
      method: 'POST',
      body: { sequence },
    }),
  retry: (token: string, id: string) =>
    apiRequest(`/chat/threads/${id}/retry`, { token, method: 'POST' }),
  help: (
    token: string,
    id: string,
    action: 'translate' | 'explain' | 'suggest',
    messageId?: string,
  ) =>
    apiRequest<{ text: string }>(`/chat/threads/${id}/help`, {
      token,
      method: 'POST',
      body: { action, messageId },
      timeoutMs: 40000,
    }),
  preferences: (token: string) =>
    apiRequest<ChatPreferences>('/chat/preferences', { token }),
  savePreferences: (token: string, body: ChatPreferences) =>
    apiRequest<ChatPreferences>('/chat/preferences', {
      token,
      method: 'PATCH',
      body,
    }),
  device: (token: string, body: { token: string; installationId: string }) =>
    apiRequest('/chat/devices', { token, method: 'POST', body }),
  removeDevice: (token: string, id: string) =>
    apiRequest(`/chat/devices/${id}`, { token, method: 'DELETE' }),
};
