import { initialRealtimeState, realtimeReducer } from './realtime-state';

describe('realtimeReducer', () => {
  it('moves through explicit audio states', () => {
    const connecting = realtimeReducer(initialRealtimeState, {
      type: 'STATUS',
      status: 'CONNECTING',
    });
    const listening = realtimeReducer(connecting, {
      type: 'STATUS',
      status: 'LISTENING',
    });

    expect(connecting).toEqual({ status: 'CONNECTING', error: null });
    expect(listening).toEqual({ status: 'LISTENING', error: null });

    const reconnecting = realtimeReducer(listening, {
      type: 'STATUS',
      status: 'RECONNECTING',
    });
    expect(reconnecting).toEqual({ status: 'RECONNECTING', error: null });
  });

  it('records errors and resets cleanly', () => {
    const failed = realtimeReducer(initialRealtimeState, {
      type: 'ERROR',
      message: 'network lost',
    });

    expect(failed).toEqual({ status: 'ERROR', error: 'network lost' });
    expect(realtimeReducer(failed, { type: 'RESET' })).toEqual(
      initialRealtimeState,
    );
  });
});
