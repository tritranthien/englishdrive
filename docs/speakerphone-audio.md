# Speakerphone audio

Release 1.1 adds a conservative residual playback echo gate for the phone audio
route, alongside the existing Android acoustic echo cancellation and noise
suppression. Headset capture keeps its existing full duplex path.

The gate retains two seconds of PCM actually written to AudioTrack and compares
40 ms microphone frames with nearby rendered output, accounting for different
sample rates and up to 350 ms of echo delay. Only a very strong normalized match
(0.94 or higher) is discarded. Different near-end speech and significant double
talk pass through to the existing VAD and target speaker verification. This is
echo suppression, not a general software acoustic echo canceler: room reverberation,
nonlinear speaker distortion, very quiet speech over loud playback and device
audio processing can still limit accuracy.

Recognized playback echo does not train VAD, feed speaker embeddings or advance
the five-second voice-filter bypass counter. The reference follows AudioTrack's
playback head rather than Gemini's server turn completion, because queued audio
can still be playing after a server turn ends. Clearing or stopping playback
clears the reference. Writes and flushes are serialized, and partial PCM writes
are handled. The playback buffer target is reduced from one second to 200 ms
(subject to Android's minimum buffer size).

The existing phone/headset enrollment profiles remain compatible because the
hardware capture and enrollment processing are unchanged. If the phone profile
was enrolled through a headset, enroll the **phone** profile with the headset
disconnected before testing the speakerphone filter.

## Validation

Run `:app:testDebugUnitTest` and `:app:assembleRelease`. Regression tests cover
delayed/attenuated echo, phase inversion, independent near-end speech, significant
double talk, silence, reset, partial writes and circular reference storage. These
are synthetic signal tests, not an acoustic benchmark on a physical phone.

On the phone, compare the previous and new APK at the same speaker volume and
distance: let the assistant finish without speaking, speak after playback ends,
then try interrupting it. Check whether assistant output appears as user transcript,
whether opening words are lost and whether the voice filter becomes bypassed.
Repeat at normal and high volumes and with a headset. Device logs tagged
`EnglishDriveAudio` report capture effects and detected residual echo without
recording microphone audio.

Android references: [AcousticEchoCanceler](https://developer.android.com/reference/android/media/audiofx/AcousticEchoCanceler),
[AudioTrack playback position](<https://developer.android.com/reference/android/media/AudioTrack#getPlaybackHeadPosition()>).
