export type RealtimeState =
  | 'IDLE'
  | 'CONNECTING'
  | 'LISTENING'
  | 'USER_SPEAKING'
  | 'AI_THINKING'
  | 'AI_SPEAKING'
  | 'PAUSED_AUDIO_FOCUS'
  | 'RECONNECTING'
  | 'ENDING'
  | 'ERROR';

export type RealtimeUiState = {
  status: RealtimeState;
  error: string | null;
};

export type RealtimeAction =
  | { type: 'STATUS'; status: RealtimeState }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

export const initialRealtimeState: RealtimeUiState = {
  status: 'IDLE',
  error: null,
};

export function realtimeReducer(
  state: RealtimeUiState,
  action: RealtimeAction,
): RealtimeUiState {
  switch (action.type) {
    case 'STATUS':
      return { status: action.status, error: null };
    case 'ERROR':
      return { status: 'ERROR', error: action.message };
    case 'RESET':
      return initialRealtimeState;
    default:
      return state;
  }
}
