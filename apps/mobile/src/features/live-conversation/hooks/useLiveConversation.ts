import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import {
  appendSessionTranscript,
  completeConversationSession,
  createConversationSession,
  createGeminiLiveToken,
  getSessionAnalysis,
  retrySessionAnalysis,
} from '../../../api/client';
import type {
  ConversationMode,
  GeminiLiveToken,
  SessionAnalysisReport,
  TranscriptMessageInput,
} from '../../../api/client';
import { commuteAudio } from '../../../native/commute-audio';
import type { CommuteAudioRoute } from '../../../native/commute-audio';
import { GeminiLiveProvider } from '../providers/GeminiLiveProvider';
import { BargeInAudioGate } from '../services/BargeInAudioGate';
import { liveAudioService } from '../services/liveAudio.service';
import type {
  LiveConversationState,
  TranscriptEvent,
  TranscriptLine,
  VocabularyHighlight,
} from '../types/liveConversation.types';

const MAX_RECONNECT_DELAY_MS = 30_000;
const TRANSCRIPT_BATCH_SIZE = 20;
const ANALYSIS_POLL_INTERVAL_MS = 1_500;
const ANALYSIS_POLL_ATTEMPTS = 20;
const THINKING_TIMEOUT_MS = 15_000;
const TRANSCRIPT_HISTORY_LIMIT = 20;

type StartLiveConversationOptions = {
  conversationMode?: ConversationMode;
  allowPermissionPrompts?: boolean;
};

async function requestConversationPermissions(allowPrompts: boolean) {
  if (Platform.OS !== 'android') return;
  let microphoneGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  );
  if (!microphoneGranted && allowPrompts) {
    microphoneGranted =
      (await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      )) === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (!microphoneGranted) throw new Error('Microphone permission is required');

  if (allowPrompts && Platform.Version >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  }
  if (allowPrompts && Platform.Version >= 31) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  }
}

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unknown live conversation error';
}

function debugLiveError(stage: string, error: unknown) {
  if (__DEV__) console.info(`[LiveConversation] ${stage}`, messageFor(error));
}

export function useLiveConversation() {
  const [status, setStatus] = useState<LiveConversationState>('idle');
  const [error, setError] = useState<string>();
  const [latestTranscript, setLatestTranscript] = useState<TranscriptEvent>();
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [vocabulary, setVocabulary] = useState<VocabularyHighlight>();
  const [history, setHistory] = useState<TranscriptLine[]>([]);
  const [filterBypassed, setFilterBypassed] = useState(false);
  const [audioRoute, setAudioRoute] = useState<CommuteAudioRoute>({
    type: 'other',
    name: 'Audio device',
  });
  const [tutor, setTutor] = useState<GeminiLiveToken['tutor']>();
  const [analysis, setAnalysis] = useState<SessionAnalysisReport>();
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const statusRef = useRef<LiveConversationState>('idle');
  const activeRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const providerRef = useRef<GeminiLiveProvider | undefined>(undefined);
  const providerCleanupRef = useRef<Array<() => void>>([]);
  const tokenRef = useRef<string | undefined>(undefined);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const conversationModeRef = useRef<ConversationMode>('FREE_CONVERSATION');
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const connectedOnceRef = useRef(false);
  const transportReadyRef = useRef(false);
  const startingRef = useRef(false);
  const hasAudioFocusRef = useRef(true);
  const networkAvailableRef = useRef(true);
  const audioRestartRef = useRef(Promise.resolve());
  const transcriptPendingRef = useRef<TranscriptMessageInput[]>([]);
  const transcriptSequenceRef = useRef(0);
  const transcriptLineRef = useRef(0);
  const transcriptUploadRef = useRef<Promise<void>>(Promise.resolve());
  const userTurnStartedAtRef = useRef<string | undefined>(undefined);
  const lastSessionIdRef = useRef<string | undefined>(undefined);
  const analysisPollGenerationRef = useRef(0);
  const scheduleReconnectRef = useRef<(immediate?: boolean) => void>(() => {});
  const bargeInGateRef = useRef(new BargeInAudioGate());

  const updateStatus = useCallback((next: LiveConversationState) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const flushTranscript = useCallback(() => {
    const upload = transcriptUploadRef.current
      .catch(() => {})
      .then(async () => {
        const token = tokenRef.current;
        const sessionId = sessionIdRef.current;
        if (!token || !sessionId) return;
        while (transcriptPendingRef.current.length > 0) {
          const batch = transcriptPendingRef.current.slice(
            0,
            TRANSCRIPT_BATCH_SIZE,
          );
          await appendSessionTranscript(token, sessionId, batch);
          transcriptPendingRef.current.splice(0, batch.length);
        }
      });
    transcriptUploadRef.current = upload;
    return upload;
  }, []);

  const pollAnalysis = useCallback(async (token: string, sessionId: string) => {
    const generation = ++analysisPollGenerationRef.current;
    setAnalysisLoading(true);
    try {
      for (let attempt = 0; attempt < ANALYSIS_POLL_ATTEMPTS; attempt += 1) {
        if (analysisPollGenerationRef.current !== generation) return;
        try {
          const report = await getSessionAnalysis(token, sessionId);
          if (analysisPollGenerationRef.current !== generation) return;
          setAnalysis(report);
          if (report.status === 'COMPLETED' || report.status === 'FAILED')
            return;
        } catch {
          // The completion response and analysis record can briefly cross in flight.
        }
        await new Promise<void>(resolve =>
          setTimeout(() => resolve(), ANALYSIS_POLL_INTERVAL_MS),
        );
      }
    } finally {
      if (analysisPollGenerationRef.current === generation) {
        setAnalysisLoading(false);
      }
    }
  }, []);

  const createProvider = useCallback(() => {
    const provider = new GeminiLiveProvider();
    providerCleanupRef.current = [
      provider.onAudio(chunk => {
        if (hasAudioFocusRef.current) liveAudioService.enqueuePlayback(chunk);
      }),
      provider.onTranscript(event => {
        setLatestTranscript(event);
        if (event.role === 'assistant') setAssistantTranscript(event.text);
        const content = event.text.trim();
        if (event.final && content) {
          transcriptLineRef.current += 1;
          const line: TranscriptLine = {
            id: transcriptLineRef.current,
            role: event.role,
            text: content,
          };
          setHistory(previous =>
            [...previous, line].slice(-TRANSCRIPT_HISTORY_LIMIT),
          );
        }
        const sessionId = sessionIdRef.current;
        if (!event.final || !content || !sessionId) return;
        transcriptSequenceRef.current += 1;
        const occurredAt =
          event.role === 'user'
            ? (userTurnStartedAtRef.current ?? new Date().toISOString())
            : new Date().toISOString();
        transcriptPendingRef.current.push({
          clientMessageId: `${Date.now()}-${transcriptSequenceRef.current}`,
          role: event.role === 'user' ? 'USER' : 'ASSISTANT',
          content,
          occurredAt,
        });
        if (event.role === 'user') userTurnStartedAtRef.current = undefined;
        flushTranscript().catch(() => {});
      }),
      provider.onVocabulary(highlight => setVocabulary(highlight)),
      provider.onInterruption(() => {
        liveAudioService.clearPlayback();
        bargeInGateRef.current.setAiSpeaking(false);
      }),
      provider.onStateChange(next => {
        bargeInGateRef.current.setAiSpeaking(next === 'ai-speaking');
        if (next === 'reconnecting') {
          transportReadyRef.current = false;
          if (connectedOnceRef.current && !intentionalStopRef.current) {
            scheduleReconnectRef.current();
          }
          return;
        }
        if (next === 'disconnected' && activeRef.current) return;
        if (next === 'listening' && !transportReadyRef.current) return;
        updateStatus(next);
      }),
      provider.onError(nextError => setError(nextError.message)),
    ];
    providerRef.current = provider;
    return provider;
  }, [flushTranscript, updateStatus]);

  const connectTransport = useCallback(
    async (isReconnect: boolean) => {
      transportReadyRef.current = false;
      const token = tokenRef.current;
      const sessionId = sessionIdRef.current;
      if (!token || !sessionId)
        throw new Error('Logical session is unavailable');
      if (!networkAvailableRef.current) throw new Error('Network unavailable');
      const provider = providerRef.current ?? createProvider();
      const liveToken = await createGeminiLiveToken(
        token,
        sessionId,
        conversationModeRef.current,
      );
      setTutor(liveToken.tutor);
      await provider.connect({
        token: liveToken.token,
        model: liveToken.model,
        systemInstruction: liveToken.sessionConfig.systemInstruction,
        tools: liveToken.sessionConfig.tools,
        resumeHandle: isReconnect ? provider.getResumeHandle() : undefined,
      });
      if (!activeRef.current || providerRef.current !== provider) return;
      transportReadyRef.current = true;
      await audioRestartRef.current;
      if (hasAudioFocusRef.current) {
        await liveAudioService.startPlayback();
        await liveAudioService.startCapture();
      }
      connectedOnceRef.current = true;
      reconnectAttemptRef.current = 0;
      setError(undefined);
      updateStatus(hasAudioFocusRef.current ? 'listening' : 'disconnected');
    },
    [createProvider, updateStatus],
  );

  scheduleReconnectRef.current = (immediate = false) => {
    if (
      !activeRef.current ||
      intentionalStopRef.current ||
      reconnectTimerRef.current
    ) {
      return;
    }
    if (!networkAvailableRef.current) {
      updateStatus('reconnecting');
      return;
    }
    liveAudioService.stopCapture().catch(() => {});
    liveAudioService.clearPlayback();
    bargeInGateRef.current.reset();
    updateStatus('reconnecting');
    const delay = immediate
      ? 0
      : Math.min(
          1000 * 2 ** reconnectAttemptRef.current,
          MAX_RECONNECT_DELAY_MS,
        );
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = undefined;
      reconnectAttemptRef.current += 1;
      connectTransport(true).catch(() => scheduleReconnectRef.current());
    }, delay);
  };

  const releaseTransport = useCallback(async () => {
    transportReadyRef.current = false;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = undefined;
    bargeInGateRef.current.reset();
    const provider = providerRef.current;
    providerRef.current = undefined;
    await Promise.allSettled([
      provider?.disconnect() ?? Promise.resolve(),
      liveAudioService.stopCapture(),
      liveAudioService.stopPlayback(),
      commuteAudio.stop(),
    ]);
    providerCleanupRef.current.forEach(cleanup => cleanup());
    providerCleanupRef.current = [];
  }, []);

  const start = useCallback(
    async (accessToken: string, options: StartLiveConversationOptions = {}) => {
      if (activeRef.current || startingRef.current) return;
      startingRef.current = true;
      intentionalStopRef.current = false;
      connectedOnceRef.current = false;
      reconnectAttemptRef.current = 0;
      setError(undefined);
      setTutor(undefined);
      setAssistantTranscript('');
      setVocabulary(undefined);
      setHistory([]);
      setFilterBypassed(false);
      transcriptLineRef.current = 0;
      analysisPollGenerationRef.current += 1;
      setAnalysis(undefined);
      setAnalysisLoading(false);
      transcriptPendingRef.current = [];
      transcriptSequenceRef.current = 0;
      transcriptUploadRef.current = Promise.resolve();
      userTurnStartedAtRef.current = undefined;
      bargeInGateRef.current.reset();
      updateStatus('connecting');
      tokenRef.current = accessToken;
      conversationModeRef.current =
        options.conversationMode ?? 'FREE_CONVERSATION';
      try {
        await requestConversationPermissions(
          options.allowPermissionPrompts ?? true,
        );
        await commuteAudio.start();
        const session = await createConversationSession(accessToken);
        sessionIdRef.current = session.id;
        activeRef.current = true;
        await connectTransport(false);
      } catch (startError) {
        debugLiveError('start failed', startError);
        activeRef.current = false;
        const sessionId = sessionIdRef.current;
        await releaseTransport();
        if (sessionId) {
          await transcriptUploadRef.current.catch(() => {});
          await completeConversationSession(
            accessToken,
            sessionId,
            transcriptPendingRef.current,
          ).catch(() => {});
        }
        sessionIdRef.current = undefined;
        setError(messageFor(startError));
        updateStatus('error');
      } finally {
        startingRef.current = false;
      }
    },
    [connectTransport, releaseTransport, updateStatus],
  );

  const stop = useCallback(async () => {
    if (!activeRef.current && statusRef.current === 'idle') return;
    intentionalStopRef.current = true;
    activeRef.current = false;
    const sessionId = sessionIdRef.current;
    const accessToken = tokenRef.current;
    await releaseTransport();
    if (sessionId && accessToken) {
      try {
        await transcriptUploadRef.current.catch(() => {});
        await completeConversationSession(
          accessToken,
          sessionId,
          transcriptPendingRef.current,
        );
        transcriptPendingRef.current = [];
        lastSessionIdRef.current = sessionId;
        updateStatus('idle');
        pollAnalysis(accessToken, sessionId).catch(() => {});
      } catch (stopError) {
        setError(messageFor(stopError));
        updateStatus('error');
        return;
      }
    }
    sessionIdRef.current = undefined;
    if (!sessionId || !accessToken) updateStatus('idle');
  }, [pollAnalysis, releaseTransport, updateStatus]);

  const retryAnalysis = useCallback(async () => {
    const token = tokenRef.current;
    const sessionId = lastSessionIdRef.current;
    if (!token || !sessionId) return;
    setAnalysisLoading(true);
    try {
      const report = await retrySessionAnalysis(token, sessionId);
      setAnalysis(report);
      await pollAnalysis(token, sessionId);
    } catch (retryError) {
      setAnalysisLoading(false);
      setError(messageFor(retryError));
    }
  }, [pollAnalysis]);

  useEffect(() => {
    if (!liveAudioService.available) return;
    const chunks = liveAudioService.onAudioChunk(chunk => {
      bargeInGateRef.current
        .handleChunk(chunk)
        .forEach(next => providerRef.current?.sendAudio(next));
    });
    const activity = liveAudioService.onActivity(speaking => {
      if (!activeRef.current || !transportReadyRef.current) return;
      if (speaking) providerRef.current?.startAudioActivity();
      bargeInGateRef.current
        .handleActivity(speaking)
        .forEach(chunk => providerRef.current?.sendAudio(chunk));
      // The native speaker gate stops sending PCM at the end of an accepted
      // turn. Tell Gemini the stream ended instead of waiting for silence
      // frames that the gate will never send.
      if (!speaking) providerRef.current?.endAudioActivity();
      if (speaking && !userTurnStartedAtRef.current) {
        userTurnStartedAtRef.current = new Date().toISOString();
      }
      if (speaking && statusRef.current !== 'ai-speaking') {
        updateStatus('user-speaking');
      } else if (statusRef.current === 'user-speaking')
        updateStatus('thinking');
    });
    const nativeError = liveAudioService.onError(nextError => {
      debugLiveError('native audio failed', nextError);
      setError(nextError.message);
      updateStatus('error');
    });
    const filterBypassedEvent = liveAudioService.onFilterBypassed(() => {
      setFilterBypassed(true);
    });
    return () => {
      chunks.remove();
      activity.remove();
      nativeError.remove();
      filterBypassedEvent.remove();
    };
  }, [updateStatus]);

  useEffect(() => {
    if (status !== 'thinking') return;
    const timeout = setTimeout(() => {
      if (!activeRef.current || statusRef.current !== 'thinking') return;
      debugLiveError(
        'thinking timeout',
        new Error('Gemini did not complete the turn; reconnecting'),
      );
      liveAudioService.clearPlayback();
      bargeInGateRef.current.reset();
      providerRef.current?.recoverFromStalledTurn();
    }, THINKING_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [status]);

  useEffect(() => {
    if (!commuteAudio.available) return;
    commuteAudio
      .getRuntimeStatus()
      .then(runtime => {
        networkAvailableRef.current = runtime.networkAvailable;
        setAudioRoute(runtime.audioRoute);
      })
      .catch(() => {});
    const network = commuteAudio.subscribeToNetwork(available => {
      networkAvailableRef.current = available;
      if (!activeRef.current || intentionalStopRef.current) return;
      if (!available) {
        transportReadyRef.current = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = undefined;
        providerRef.current?.endAudioActivity();
        providerRef.current?.disconnect().catch(() => {});
        liveAudioService.stopCapture().catch(() => {});
        liveAudioService.clearPlayback();
        bargeInGateRef.current.reset();
        updateStatus('reconnecting');
        return;
      }
      reconnectAttemptRef.current = 0;
      if (
        statusRef.current === 'reconnecting' ||
        statusRef.current === 'disconnected'
      ) {
        scheduleReconnectRef.current(true);
      }
    });
    const route = commuteAudio.subscribeToAudioRoute(nextRoute => {
      setAudioRoute(nextRoute);
      if (
        !activeRef.current ||
        !transportReadyRef.current ||
        !hasAudioFocusRef.current ||
        statusRef.current === 'reconnecting'
      ) {
        return;
      }
      audioRestartRef.current = audioRestartRef.current
        .then(async () => {
          if (!activeRef.current || !transportReadyRef.current) return;
          providerRef.current?.endAudioActivity();
          liveAudioService.clearPlayback();
          bargeInGateRef.current.reset();
          await liveAudioService.stopCapture();
          await liveAudioService.stopPlayback();
          if (
            !activeRef.current ||
            !transportReadyRef.current ||
            !hasAudioFocusRef.current
          )
            return;
          await liveAudioService.startPlayback();
          await liveAudioService.startCapture();
        })
        .catch(nextError => {
          debugLiveError('audio route restart failed', nextError);
          setError(messageFor(nextError));
          updateStatus('error');
        });
    });
    const appState = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active' || !activeRef.current) return;
      commuteAudio.start().catch(() => {});
      if (
        networkAvailableRef.current &&
        (statusRef.current === 'reconnecting' ||
          statusRef.current === 'disconnected')
      ) {
        scheduleReconnectRef.current(true);
      }
    });
    return () => {
      network.remove();
      route.remove();
      appState.remove();
    };
  }, [updateStatus]);

  useEffect(() => {
    if (!commuteAudio.available) return;
    const focus = commuteAudio.subscribeToAudioFocus(hasFocus => {
      const previousFocus = hasAudioFocusRef.current;
      hasAudioFocusRef.current = hasFocus;
      if (
        !activeRef.current ||
        !transportReadyRef.current ||
        previousFocus === hasFocus
      )
        return;
      if (hasFocus) {
        bargeInGateRef.current.reset();
        audioRestartRef.current = audioRestartRef.current
          .then(async () => {
            if (
              !activeRef.current ||
              !transportReadyRef.current ||
              !hasAudioFocusRef.current
            )
              return;
            await liveAudioService.startCapture();
            updateStatus('listening');
          })
          .catch(nextError => {
            debugLiveError('audio focus resume failed', nextError);
            setError(messageFor(nextError));
            updateStatus('error');
          });
      } else {
        providerRef.current?.endAudioActivity();
        liveAudioService.stopCapture().catch(() => {});
        liveAudioService.clearPlayback();
        bargeInGateRef.current.reset();
        updateStatus('disconnected');
      }
    });
    const serviceStopped = commuteAudio.subscribeToServiceStopped(() => {
      if (activeRef.current) stop().catch(() => {});
    });
    return () => {
      focus.remove();
      serviceStopped.remove();
    };
  }, [stop, updateStatus]);

  useEffect(
    () => () => {
      activeRef.current = false;
      intentionalStopRef.current = true;
      analysisPollGenerationRef.current += 1;
      releaseTransport().catch(() => {});
    },
    [releaseTransport],
  );

  return {
    status,
    error,
    latestTranscript,
    assistantTranscript,
    vocabulary,
    history,
    filterBypassed,
    audioRoute,
    tutor,
    analysis,
    analysisLoading,
    isActive: activeRef.current,
    provider: 'gemini' as const,
    start,
    stop,
    retryAnalysis,
  };
}
