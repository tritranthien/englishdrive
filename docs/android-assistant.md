# Android Assistant and Wake Phrase

EnglishDrive declares a `VoiceInteractionService` and requests the Android assistant role through
`RoleManager`. The user must approve the system role dialog. Invoking the selected assistant from a
system gesture opens the existing React Native activity.

Wake detection uses `SpeechRecognizer.createOnDeviceSpeechRecognizer`, available from Android 12.
The app checks `isOnDeviceRecognitionAvailable` and disables arming when the device does not provide
an offline recognizer. Audio from wake detection is never sent to EnglishDrive, Gemini, or the
NestJS backend.

```text
Visible app -> user taps ARM WAKE PHRASE
            -> microphone foreground service
            -> Android on-device recognizer
            -> "Hey English Drive" detected
            -> recognizer destroyed
            -> React Native wake event
            -> existing service switches to conversation mode
            -> Gemini Live session starts
```

Only one component owns microphone capture at a time. Wake recognition stops before native PCM
capture starts. The same non-sticky foreground service is reused so the transition does not create
a second persistent microphone service.

Arming is explicit and ephemeral. The app has no boot receiver and does not persist the armed flag.
Stopping the notification, removing the assistant role, killing the service, or force-stopping the
app disarms wake detection. Realtime credentials remain short-lived and the permanent Gemini key
stays on the backend.
