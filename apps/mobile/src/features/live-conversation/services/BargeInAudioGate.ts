import type { PcmAudioChunk } from '../types/liveConversation.types';

const PRE_ROLL_CHUNKS = 6;

/**
 * Holds microphone audio only while the model is speaking. A confirmed local
 * speech transition opens the gate and flushes 240 ms of pre-roll so the first
 * syllable is preserved. Gemini remains the authoritative turn detector.
 */
export class BargeInAudioGate {
  private aiSpeaking = false;
  private localSpeaking = false;
  private open = false;
  private preRoll: PcmAudioChunk[] = [];

  setAiSpeaking(speaking: boolean) {
    if (this.aiSpeaking === speaking) return;
    this.aiSpeaking = speaking;
    this.open = false;
    this.preRoll = [];
  }

  handleChunk(chunk: PcmAudioChunk) {
    if (!this.aiSpeaking || this.open) return [chunk];
    this.preRoll.push(chunk);
    if (this.preRoll.length > PRE_ROLL_CHUNKS) this.preRoll.shift();
    return [];
  }

  handleActivity(speaking: boolean) {
    const started = speaking && !this.localSpeaking;
    this.localSpeaking = speaking;
    if (!this.aiSpeaking) return [];
    if (!speaking) {
      this.open = false;
      this.preRoll = [];
      return [];
    }
    if (!started) return [];
    this.open = true;
    const buffered = this.preRoll;
    this.preRoll = [];
    return buffered;
  }

  reset() {
    this.aiSpeaking = false;
    this.localSpeaking = false;
    this.open = false;
    this.preRoll = [];
  }
}
