import { BargeInAudioGate } from './BargeInAudioGate';

const chunk = (data: string) => ({
  data,
  mimeType: 'audio/pcm;rate=16000',
});

describe('BargeInAudioGate', () => {
  it('does not gate microphone audio while the model is listening', () => {
    const gate = new BargeInAudioGate();
    expect(gate.handleChunk(chunk('speech'))).toEqual([chunk('speech')]);
  });

  it('holds noise while the model speaks and flushes bounded pre-roll on speech', () => {
    const gate = new BargeInAudioGate();
    gate.setAiSpeaking(true);
    for (let index = 0; index < 8; index += 1) {
      expect(gate.handleChunk(chunk(`chunk-${index}`))).toEqual([]);
    }

    expect(gate.handleActivity(true).map(item => item.data)).toEqual([
      'chunk-2',
      'chunk-3',
      'chunk-4',
      'chunk-5',
      'chunk-6',
      'chunk-7',
    ]);
    expect(gate.handleChunk(chunk('live-speech'))).toEqual([
      chunk('live-speech'),
    ]);
  });

  it('requires a fresh speech transition and resets cleanly', () => {
    const gate = new BargeInAudioGate();
    gate.handleActivity(true);
    gate.setAiSpeaking(true);
    gate.handleChunk(chunk('echo'));
    expect(gate.handleActivity(true)).toEqual([]);
    expect(gate.handleActivity(false)).toEqual([]);
    gate.handleChunk(chunk('pre-roll'));
    expect(gate.handleActivity(true)).toEqual([chunk('pre-roll')]);

    gate.reset();
    expect(gate.handleChunk(chunk('after-reset'))).toEqual([
      chunk('after-reset'),
    ]);
  });
});
