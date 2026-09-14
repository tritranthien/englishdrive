import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  completeConversationSession,
  createConversationSession,
  createRealtimeAuthorization,
} from '../api/client';
import { commuteAudio } from '../native/commute-audio';
import { initialRealtimeState, realtimeReducer } from './realtime-state';

type RealtimeEvent = { type?: string; error?: { message?: string } };
type RealtimeDataChannel = ReturnType<RTCPeerConnection['createDataChannel']>;
type PeerTrackEvent = Parameters<NonNullable<RTCPeerConnection['ontrack']>>[0];
type DataChannelMessageEvent = Parameters<
  NonNullable<RealtimeDataChannel['onmessage']>
>[0];

const MAX_RECONNECT_ATTEMPTS = 3;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Realtime error';
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 3000);
    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        peer.onicegatheringstatechange = null;
        resolve();
      }
    };
  });
}

async function requestAndroidPermissions(allowPrompts: boolean) {
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
  if (!microphoneGranted) {
    throw new Error('Microphone permission is required');
  }
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

export function useRealtimeCall() {
  const [state, dispatch] = useReducer(realtimeReducer, initialRealtimeState);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string>();
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RealtimeDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const hasAudioFocusRef = useRef(true);
  const responseActiveRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef<() => void>(() => {});

  const closePeer = useCallback(() => {
    const peer = peerRef.current;
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.onicegatheringstatechange = null;
      peer.ontrack = null;
      peer.close();
    }
    dataChannelRef.current?.close();
    remoteStreamRef.current?.release(false);
    peerRef.current = null;
    dataChannelRef.current = null;
    remoteStreamRef.current = null;
    responseActiveRef.current = false;
    setRemoteStreamUrl(undefined);
  }, []);

  const releaseAll = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    closePeer();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    commuteAudio.stop().catch(() => {});
  }, [closePeer]);

  const handleRealtimeEvent = useCallback(
    (channel: RealtimeDataChannel, rawData: unknown) => {
      if (typeof rawData !== 'string') return;
      let event: RealtimeEvent;
      try {
        event = JSON.parse(rawData) as RealtimeEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          dispatch({ type: 'STATUS', status: 'USER_SPEAKING' });
          if (responseActiveRef.current && channel.readyState === 'open') {
            channel.send(JSON.stringify({ type: 'response.cancel' }));
            channel.send(JSON.stringify({ type: 'output_audio_buffer.clear' }));
          }
          break;
        case 'input_audio_buffer.speech_stopped':
        case 'response.created':
          responseActiveRef.current = true;
          dispatch({ type: 'STATUS', status: 'AI_THINKING' });
          break;
        case 'output_audio_buffer.started':
        case 'response.output_audio.delta':
        case 'response.audio.delta':
          dispatch({ type: 'STATUS', status: 'AI_SPEAKING' });
          break;
        case 'response.done':
          responseActiveRef.current = false;
          dispatch({ type: 'STATUS', status: 'LISTENING' });
          break;
        case 'error':
          dispatch({
            type: 'ERROR',
            message: event.error?.message ?? 'OpenAI Realtime error',
          });
          break;
      }
    },
    [],
  );

  const establishConnection = useCallback(
    async (token: string, sessionId: string) => {
      closePeer();
      const authorization = await createRealtimeAuthorization(token, sessionId);
      let localStream = localStreamRef.current;
      if (!localStream) {
        localStream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        localStreamRef.current = localStream;
      }
      localStream.getAudioTracks().forEach(track => {
        track.enabled = hasAudioFocusRef.current;
      });
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      const channel = peer.createDataChannel('oai-events');
      localStream
        .getTracks()
        .forEach(track => peer.addTrack(track, localStream));
      peerRef.current = peer;
      dataChannelRef.current = channel;

      peer.ontrack = (event: PeerTrackEvent) => {
        const remoteStream = event.streams[0];
        if (remoteStream) {
          remoteStream
            .getAudioTracks()
            .forEach((track: { enabled: boolean }) => {
              track.enabled = hasAudioFocusRef.current;
            });
          remoteStreamRef.current = remoteStream;
          setRemoteStreamUrl(remoteStream.toURL());
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer !== peerRef.current || !activeRef.current) return;
        if (peer.connectionState === 'connected') {
          reconnectAttemptRef.current = 0;
          dispatch({
            type: 'STATUS',
            status: hasAudioFocusRef.current
              ? 'LISTENING'
              : 'PAUSED_AUDIO_FOCUS',
          });
        } else if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'disconnected'
        ) {
          reconnectRef.current();
        }
      };
      channel.onmessage = (event: DataChannelMessageEvent) => {
        handleRealtimeEvent(channel, event.data);
      };
      channel.onopen = () => {
        dispatch({ type: 'STATUS', status: 'LISTENING' });
        channel.send(
          JSON.stringify({
            type: 'response.create',
            response: {
              instructions:
                reconnectAttemptRef.current === 0
                  ? 'Greet the user briefly and invite them to start talking.'
                  : 'Continue naturally after a brief connection interruption.',
            },
          }),
        );
      };

      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
        voiceActivityDetection: true,
      });
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const offerSdp = peer.localDescription?.sdp;
      if (!offerSdp) throw new Error('WebRTC did not produce an SDP offer');

      const formData = new FormData();
      formData.append('sdp', offerSdp);
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authorization.clientSecret}` },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          `OpenAI WebRTC negotiation failed (${response.status})`,
        );
      }
      await peer.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: await response.text(),
        }),
      );
    },
    [closePeer, handleRealtimeEvent],
  );

  reconnectRef.current = () => {
    if (!activeRef.current || reconnectTimerRef.current) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      dispatch({
        type: 'ERROR',
        message: 'Could not restore the Realtime connection after 3 attempts',
      });
      return;
    }
    dispatch({ type: 'STATUS', status: 'RECONNECTING' });
    const delay = 1000 * 2 ** reconnectAttemptRef.current;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      reconnectAttemptRef.current += 1;
      const token = tokenRef.current;
      const sessionId = sessionIdRef.current;
      if (!token || !sessionId || !activeRef.current) return;
      establishConnection(token, sessionId).catch(() => reconnectRef.current());
    }, delay);
  };

  const start = useCallback(
    async (token: string, allowPermissionPrompts = true) => {
      if (activeRef.current) return;
      dispatch({ type: 'STATUS', status: 'CONNECTING' });
      tokenRef.current = token;
      try {
        await requestAndroidPermissions(allowPermissionPrompts);
        await commuteAudio.start();
        const session = await createConversationSession(token);
        sessionIdRef.current = session.id;
        activeRef.current = true;
        reconnectAttemptRef.current = 0;
        await establishConnection(token, session.id);
      } catch (error) {
        activeRef.current = false;
        releaseAll();
        const sessionId = sessionIdRef.current;
        sessionIdRef.current = null;
        if (sessionId) {
          await completeConversationSession(token, sessionId).catch(() => {});
        }
        dispatch({ type: 'ERROR', message: errorMessage(error) });
      }
    },
    [establishConnection, releaseAll],
  );

  const stop = useCallback(async () => {
    dispatch({ type: 'STATUS', status: 'ENDING' });
    activeRef.current = false;
    const sessionId = sessionIdRef.current;
    const token = tokenRef.current;
    sessionIdRef.current = null;
    releaseAll();
    if (sessionId && token) {
      try {
        await completeConversationSession(token, sessionId);
      } catch (error) {
        dispatch({ type: 'ERROR', message: errorMessage(error) });
        return;
      }
    }
    dispatch({ type: 'RESET' });
  }, [releaseAll]);

  useEffect(() => {
    if (!commuteAudio.available) return;
    const focusSubscription = commuteAudio.subscribeToAudioFocus(hasFocus => {
      hasAudioFocusRef.current = hasFocus;
      localStreamRef.current?.getAudioTracks().forEach(track => {
        track.enabled = hasFocus;
      });
      remoteStreamRef.current?.getAudioTracks().forEach(track => {
        track.enabled = hasFocus;
      });
      if (activeRef.current) {
        dispatch({
          type: 'STATUS',
          status: hasFocus ? 'LISTENING' : 'PAUSED_AUDIO_FOCUS',
        });
      }
    });
    const stopSubscription = commuteAudio.subscribeToServiceStopped(() => {
      if (activeRef.current) stop().catch(() => {});
    });
    return () => {
      focusSubscription.remove();
      stopSubscription.remove();
    };
  }, [stop]);

  useEffect(
    () => () => {
      activeRef.current = false;
      releaseAll();
    },
    [releaseAll],
  );

  return {
    ...state,
    isActive: activeRef.current,
    remoteStreamUrl,
    start,
    stop,
  };
}
