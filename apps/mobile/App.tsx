import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  login,
  register,
  type AuthResult,
  type ConversationMode,
} from './src/api/client';
import { useLiveConversation } from './src/features/live-conversation/hooks/useLiveConversation';
import { useSpeakerVerification } from './src/features/speaker-verification/useSpeakerVerification';
import { commuteAudio, type AssistantStatus } from './src/native/commute-audio';
import { authSession } from './src/native/auth-session';
import { useVocabulary } from './src/features/vocabulary/useVocabulary';
import { useVocabularyDecks } from './src/features/vocabulary/useVocabularyDecks';
import { AppNavigation } from './src/navigation/AppNavigation';
import { styles } from './src/screens/styles';

function AppContent() {
  const [auth, setAuth] = useState<AuthResult>();
  const [authRestoring, setAuthRestoring] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authError, setAuthError] = useState<string>();
  const [authLoading, setAuthLoading] = useState(false);
  const [conversationMode, setConversationMode] =
    useState<ConversationMode>('FREE_CONVERSATION');
  const vocabularyNotebook = useVocabulary(auth?.user.id, auth?.accessToken);
  const vocabularyDecks = useVocabularyDecks(auth?.user.id, auth?.accessToken);
  const realtime = useLiveConversation(vocabularyNotebook.capture, word =>
    vocabularyNotebook.save([word]),
  );
  const speakerVerification = useSpeakerVerification();
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>();
  const [assistantError, setAssistantError] = useState<string>();
  const realtimeStart = realtime.start;
  const realtimeIsActive = realtime.isActive;

  useEffect(() => {
    if (!auth || !speakerVerification.status?.enrolling) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, [auth, speakerVerification.status?.enrolling]);

  useEffect(() => {
    let mounted = true;
    authSession
      .restore()
      .then(session => {
        if (mounted) setAuth(session);
      })
      .catch(() => {
        if (mounted)
          setAuthError('Không khôi phục được phiên. Vui lòng đăng nhập lại.');
      })
      .finally(() => {
        if (mounted) setAuthRestoring(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAssistantStatus = useCallback(async () => {
    if (!commuteAudio.available) return;
    try {
      setAssistantStatus(await commuteAudio.getAssistantStatus());
    } catch (error) {
      setAssistantError(
        error instanceof Error
          ? error.message
          : 'Không đọc được trạng thái trợ lý',
      );
    }
  }, []);

  useEffect(() => {
    refreshAssistantStatus().catch(() => {});
  }, [refreshAssistantStatus]);

  useEffect(() => {
    if (!commuteAudio.available) return;
    const detected = commuteAudio.subscribeToWakeDetected(() => {
      setAssistantStatus(current =>
        current ? { ...current, wakeArmed: false } : current,
      );
      if (auth && !realtimeIsActive) {
        realtimeStart(auth.accessToken, {
          conversationMode,
          allowPermissionPrompts: false,
        }).catch(error => {
          setAssistantError(
            error instanceof Error
              ? error.message
              : 'Không bắt đầu được hội thoại',
          );
        });
      }
    });
    const stateChanged = commuteAudio.subscribeToWakeState(wakeArmed => {
      setAssistantStatus(current =>
        current ? { ...current, wakeArmed } : current,
      );
    });
    const wakeError = commuteAudio.subscribeToWakeError(setAssistantError);
    return () => {
      detected.remove();
      stateChanged.remove();
      wakeError.remove();
    };
  }, [auth, conversationMode, realtimeIsActive, realtimeStart]);

  async function requestAssistantRole() {
    setAssistantError(undefined);
    try {
      await commuteAudio.requestAssistantRole();
      await refreshAssistantStatus();
    } catch (error) {
      setAssistantError(
        error instanceof Error
          ? error.message
          : 'Không chọn được trợ lý mặc định',
      );
    }
  }

  async function toggleWakePhrase() {
    setAssistantError(undefined);
    try {
      if (assistantStatus?.wakeArmed) {
        await commuteAudio.disarmWakeWord();
      } else {
        const microphone = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (microphone !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Vui lòng cấp quyền sử dụng mic');
        }
        if (Number(Platform.Version) >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );
        }
        if (Number(Platform.Version) >= 31) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          );
        }
        await commuteAudio.armWakeWord();
      }
      await refreshAssistantStatus();
    } catch (error) {
      setAssistantError(
        error instanceof Error
          ? error.message
          : 'Không thay đổi được trạng thái câu gọi',
      );
    }
  }

  async function submitAuth() {
    setAuthLoading(true);
    setAuthError(undefined);
    try {
      const result =
        authMode === 'register'
          ? await register({ email, password, name })
          : await login({ email, password });
      await authSession.save(result);
      setPassword('');
      setAuth(result);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Không đăng nhập được',
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    setAuthLoading(true);
    setAssistantError(undefined);
    try {
      await authSession.clear();
      setAuth(undefined);
      setPassword('');
      setAuthMode('login');
    } catch {
      setAssistantError('Không đăng xuất được. Vui lòng thử lại.');
    } finally {
      setAuthLoading(false);
    }
  }

  if (authRestoring) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.authContainer}>
          <ActivityIndicator color="#53d9b1" />
          <Text style={styles.subtitle}>Đang khôi phục phiên đăng nhập…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!auth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.authContainer}
        >
          <Text style={styles.eyebrow}>ENGLISH DRIVE</Text>
          <Text style={styles.title}>Trợ lý luyện nói cùng bạn</Text>
          <Text style={styles.subtitle}>
            Đăng nhập để bắt đầu trò chuyện bằng giọng nói.
          </Text>

          {authMode === 'register' ? (
            <TextInput
              accessibilityLabel="Tên"
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Tên của bạn"
              placeholderTextColor="#74839a"
              style={styles.input}
              value={name}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Địa chỉ email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Địa chỉ email"
            placeholderTextColor="#74839a"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Mật khẩu"
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Mật khẩu (ít nhất 8 ký tự)"
            placeholderTextColor="#74839a"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          <Pressable
            disabled={authLoading}
            onPress={submitAuth}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            {authLoading ? (
              <ActivityIndicator color="#07111f" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {authMode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setAuthError(undefined);
              setAuthMode(authMode === 'register' ? 'login' : 'register');
            }}
          >
            <Text style={styles.switchText}>
              {authMode === 'register'
                ? 'Đã có tài khoản? Đăng nhập'
                : 'Chưa có tài khoản? Đăng ký'}
            </Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const isEnrolling = speakerVerification.status?.enrolling === true;

  return (
    <AppNavigation
      key={auth.user.id}
      conversation={{
        auth,
        realtime,
        vocabularyNotebook,
        conversationMode,
        isEnrolling,
      }}
      vocabulary={{
        vocabularyNotebook,
        vocabularyDecks,
        reportWords: realtime.analysis?.newVocabulary,
      }}
      settings={{
        user: auth.user,
        realtime,
        speakerVerification,
        assistantStatus,
        assistantError,
        conversationMode,
        setConversationMode,
        requestAssistantRole,
        toggleWakePhrase,
        signOut,
        authLoading,
      }}
      refreshAssistantStatus={refreshAssistantStatus}
    />
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export default App;
