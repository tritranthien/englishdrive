import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
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
  type SessionAnalysisReport,
} from './src/api/client';
import { useLiveConversation } from './src/features/live-conversation/hooks/useLiveConversation';
import { useSpeakerVerification } from './src/features/speaker-verification/useSpeakerVerification';
import { commuteAudio, type AssistantStatus } from './src/native/commute-audio';

const statusLabels = {
  idle: 'Ready',
  connecting: 'Connecting to Gemini…',
  listening: 'Listening',
  'user-speaking': 'You are speaking',
  thinking: 'Thinking…',
  'ai-speaking': 'EnglishDrive is speaking',
  reconnecting: 'Reconnecting…',
  disconnected: 'Audio paused',
  error: 'Connection error',
} as const;

const conversationModes: Array<{
  value: ConversationMode;
  label: string;
}> = [
  { value: 'FREE_CONVERSATION', label: 'Free talk' },
  { value: 'DAILY_LIFE', label: 'Daily life' },
  { value: 'WORK_SOFTWARE', label: 'Work & software' },
  { value: 'VOCABULARY_PRACTICE', label: 'Vocabulary' },
  { value: 'GRAMMAR_PRACTICE', label: 'Grammar' },
  { value: 'ROLE_PLAY', label: 'Role play' },
  { value: 'PRONUNCIATION_PRACTICE', label: 'Pronunciation' },
];

const voiceEnrollmentScript =
  'Xin chào, hôm nay tôi muốn trò chuyện bằng tiếng Việt. Please speak slowly and help me practice English when I ask. Tôi đang trên đường đi làm và muốn nói chuyện thật tự nhiên. Hãy giải thích rõ ràng và tiếp tục câu chuyện nhé.';

function HighlightedCaption({ text, term }: { text: string; term?: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (!term || index < 0) {
    return <Text style={styles.captionText}>{text}</Text>;
  }
  return (
    <Text style={styles.captionText}>
      {text.slice(0, index)}
      <Text style={styles.captionHighlight}>
        {text.slice(index, index + term.length)}
      </Text>
      {text.slice(index + term.length)}
    </Text>
  );
}

function ReportSection({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.reportSection}>
      <Text style={styles.reportSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SessionReport({ report }: { report: SessionAnalysisReport }) {
  return (
    <View style={styles.reportPanel}>
      <Text style={styles.panelTitle}>AFTER TRIP REPORT</Text>
      <Text style={styles.reportSummary}>{report.summary}</Text>
      {report.mainTopics?.length ? (
        <ReportSection title="Main topics">
          <Text style={styles.reportText}>{report.mainTopics.join(' · ')}</Text>
        </ReportSection>
      ) : null}
      {report.grammarIssues?.length ? (
        <ReportSection title="Grammar">
          {report.grammarIssues.slice(0, 5).map((issue, index) => (
            <View key={`${issue.pattern}-${index}`} style={styles.reportItem}>
              <Text style={styles.reportOriginal}>“{issue.original}”</Text>
              <Text style={styles.reportSuggestion}>→ {issue.suggestion}</Text>
              <Text style={styles.reportText}>{issue.explanationVi}</Text>
            </View>
          ))}
        </ReportSection>
      ) : null}
      {report.newVocabulary?.length ? (
        <ReportSection title="New vocabulary">
          {report.newVocabulary.slice(0, 6).map(item => (
            <Text key={item.term} style={styles.reportText}>
              <Text style={styles.reportTerm}>{item.term}</Text> —{' '}
              {item.meaningVi}
            </Text>
          ))}
        </ReportSection>
      ) : null}
      {report.strengths?.length ? (
        <ReportSection title="What went well">
          {report.strengths.slice(0, 3).map((strength, index) => (
            <Text
              key={`${strength.example}-${index}`}
              style={styles.reportText}
            >
              {strength.reasonVi}
            </Text>
          ))}
        </ReportSection>
      ) : null}
      {report.nextSessionFocus?.length ? (
        <ReportSection title="Next session">
          <Text style={styles.reportText}>
            {report.nextSessionFocus.join(' · ')}
          </Text>
        </ReportSection>
      ) : null}
    </View>
  );
}

function AppContent() {
  const [auth, setAuth] = useState<AuthResult>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authError, setAuthError] = useState<string>();
  const [authLoading, setAuthLoading] = useState(false);
  const [conversationMode, setConversationMode] =
    useState<ConversationMode>('FREE_CONVERSATION');
  const [historyOpen, setHistoryOpen] = useState(false);
  const realtime = useLiveConversation();
  const speakerVerification = useSpeakerVerification();
  const liveAudioProfileKind =
    realtime.audioRoute.type === 'bluetooth' ||
    realtime.audioRoute.type === 'wired'
      ? 'headset'
      : 'phone';
  const currentVoiceProfileKind = realtime.isActive
    ? liveAudioProfileKind
    : (speakerVerification.status?.currentRouteKind ?? liveAudioProfileKind);
  const currentVoiceProfileEnrolled =
    currentVoiceProfileKind === 'headset'
      ? speakerVerification.status?.headsetEnrolled
      : speakerVerification.status?.phoneEnrolled;
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>();
  const [assistantError, setAssistantError] = useState<string>();
  const realtimeStart = realtime.start;
  const realtimeIsActive = realtime.isActive;

  const refreshAssistantStatus = useCallback(async () => {
    if (!commuteAudio.available) return;
    try {
      setAssistantStatus(await commuteAudio.getAssistantStatus());
    } catch (error) {
      setAssistantError(
        error instanceof Error
          ? error.message
          : 'Could not read assistant status',
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
            error instanceof Error ? error.message : 'Could not start Realtime',
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
        error instanceof Error ? error.message : 'Assistant selection failed',
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
          throw new Error('Microphone permission is required');
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
        error instanceof Error ? error.message : 'Wake phrase action failed',
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
      setAuth(result);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setAuthLoading(false);
    }
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
          <Text style={styles.title}>Your realtime speaking companion</Text>
          <Text style={styles.subtitle}>
            Sign in once, then start a hands-free voice conversation.
          </Text>

          {authMode === 'register' ? (
            <TextInput
              accessibilityLabel="Name"
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#74839a"
              style={styles.input}
              value={name}
            />
          ) : null}
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#74839a"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Password (8+ characters)"
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
                {authMode === 'register' ? 'Create account' : 'Sign in'}
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
                ? 'Already registered? Sign in'
                : 'New here? Create account'}
            </Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const isActive = realtime.isActive;
  const isEnrolling = speakerVerification.status?.enrolling === true;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.sessionContainer}>
        <View>
          <Text style={styles.eyebrow}>COMMUTE ASSISTANT</Text>
          <Text style={styles.welcome}>Hi, {auth.user.name}</Text>
          <Text style={styles.subtitle}>
            You can lock the screen after the conversation connects. Android
            keeps the microphone session visible in a notification.
          </Text>
        </View>

        <View style={styles.assistantPanel}>
          <Text style={styles.panelTitle}>HEY ENGLISH DRIVE</Text>
          <Text style={styles.panelText}>
            {assistantStatus && !assistantStatus.roleAvailable
              ? 'Requires Android 12+ and an available Android assistant role.'
              : assistantStatus?.isDefaultAssistant
                ? assistantStatus.onDeviceWakeAvailable
                  ? assistantStatus.wakeArmed
                    ? 'Armed. You can lock the screen and say the wake phrase.'
                    : 'Ready to arm on-device wake detection.'
                  : 'On-device recognition is unavailable on this phone.'
                : 'Select EnglishDrive as the Android assistant first.'}
          </Text>
          {assistantError ? (
            <Text style={styles.error}>{assistantError}</Text>
          ) : null}
          {!assistantStatus?.isDefaultAssistant ? (
            <Pressable
              disabled={!assistantStatus?.roleAvailable || realtime.isActive}
              onPress={requestAssistantRole}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>SET AS ASSISTANT</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={
                !assistantStatus.onDeviceWakeAvailable || realtime.isActive
              }
              onPress={toggleWakePhrase}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {assistantStatus.wakeArmed
                  ? 'DISARM WAKE PHRASE'
                  : 'ARM WAKE PHRASE'}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.assistantPanel}>
          <Text style={styles.panelTitle}>MY VOICE FILTER</Text>
          <Text style={styles.panelText}>
            {!speakerVerification.status
              ? 'Checking on-device speaker verification…'
              : !speakerVerification.status.configured
                ? 'The bundled open-source speaker model is unavailable. Rebuild the app.'
                : speakerVerification.status.enrolling
                  ? `Enrolling ${speakerVerification.status.enrollingKind ?? 'voice'} profile. Keep speaking naturally. ${speakerVerification.progress}% complete.`
                  : currentVoiceProfileEnrolled
                    ? `Active for ${currentVoiceProfileKind} microphone. Only matching voice is sent to Gemini.`
                    : `Voice filter off for ${currentVoiceProfileKind} microphone. Conversation remains available until this profile is enrolled.`}
          </Text>
          {speakerVerification.status?.enrolling ? (
            <View style={styles.enrollmentScript}>
              <Text style={styles.enrollmentScriptTitle}>
                ĐỌC BẰNG GIỌNG TỰ NHIÊN
              </Text>
              <Text style={styles.enrollmentScriptText}>
                {voiceEnrollmentScript}
              </Text>
              <Text style={styles.enrollmentScriptHint}>
                Nếu chưa đạt 100%, hãy đọc lại từ đầu. Không cần đọc nhanh.
              </Text>
            </View>
          ) : null}
          {speakerVerification.status?.needsReenrollment ? (
            <Text style={styles.profileWarning}>
              Your old single-microphone profile must be enrolled again.
            </Text>
          ) : null}
          {speakerVerification.error ? (
            <Text style={styles.error}>{speakerVerification.error}</Text>
          ) : null}
          {speakerVerification.status?.configured ? (
            <>
              {(['phone', 'headset'] as const).map(kind => {
                const enrolled =
                  kind === 'phone'
                    ? speakerVerification.status?.phoneEnrolled
                    : speakerVerification.status?.headsetEnrolled;
                const selected = currentVoiceProfileKind === kind;
                const disabled =
                  isActive ||
                  assistantStatus?.wakeArmed ||
                  speakerVerification.status?.enrolling ||
                  !selected;
                return (
                  <View key={kind} style={styles.profileRow}>
                    <View style={styles.profileHeader}>
                      <Text style={styles.profileName}>
                        {kind === 'phone'
                          ? 'PHONE MICROPHONE'
                          : 'HEADSET MICROPHONE'}
                      </Text>
                      <Text style={styles.profileState}>
                        {enrolled ? 'ENROLLED' : 'NOT ENROLLED'}
                        {selected ? ' · CURRENT' : ''}
                      </Text>
                    </View>
                    <Pressable
                      disabled={disabled}
                      onPress={() => speakerVerification.enroll(kind)}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        disabled && styles.disabledButton,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {enrolled ? 'RE-ENROLL' : 'ENROLL'} {kind.toUpperCase()}
                      </Text>
                    </Pressable>
                    {enrolled ? (
                      <Pressable
                        disabled={
                          isActive || speakerVerification.status?.enrolling
                        }
                        onPress={() => speakerVerification.remove(kind)}
                        style={styles.textButton}
                      >
                        <Text
                          style={[
                            styles.switchText,
                            (isActive ||
                              speakerVerification.status?.enrolling) &&
                              styles.disabledText,
                          ]}
                        >
                          Reset {kind} profile
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              {speakerVerification.status.enrolling ? (
                <Pressable
                  onPress={speakerVerification.cancel}
                  style={styles.textButton}
                >
                  <Text style={styles.switchText}>Cancel enrollment</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={styles.statusPanel}>
          <Text style={styles.modeTitle}>CONVERSATION MODE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.modeScroller}
          >
            {conversationModes.map(mode => (
              <Pressable
                key={mode.value}
                disabled={isActive}
                onPress={() => setConversationMode(mode.value)}
                style={[
                  styles.modeChip,
                  conversationMode === mode.value && styles.modeChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    conversationMode === mode.value &&
                      styles.modeChipTextSelected,
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View
            style={[
              styles.pulse,
              realtime.status === 'error' && styles.pulseError,
            ]}
          />
          <Text style={styles.statusText}>{statusLabels[realtime.status]}</Text>
          <Text style={styles.statusHint}>
            {realtime.status === 'idle'
              ? 'Microphone starts only after you tap Start.'
              : realtime.status === 'error'
                ? realtime.error
                : realtime.status === 'disconnected'
                  ? 'Another app or phone call is using audio'
                  : realtime.status === 'reconnecting'
                    ? 'Restoring this conversation without creating a new session'
                    : `Gemini Live active via ${realtime.audioRoute.name}`}
          </Text>
        </View>

        {isActive && realtime.filterBypassed ? (
          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>VOICE FILTER TURNED OFF</Text>
            <Text style={styles.warningText}>
              Your voice did not match the enrolled profile, so this session is
              sending audio without the filter. Reset the profile and enroll
              again somewhere quiet.
            </Text>
          </View>
        ) : null}

        {isActive && realtime.assistantTranscript ? (
          <View style={styles.captionPanel}>
            <Text style={styles.captionLabel}>TUTOR SAID</Text>
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.captionScroll}
            >
              <HighlightedCaption
                text={realtime.assistantTranscript}
                term={realtime.vocabulary?.term}
              />
            </ScrollView>
          </View>
        ) : null}

        {isActive && realtime.vocabulary ? (
          <View style={styles.vocabularyPanel}>
            <Text style={styles.captionLabel}>NEW WORD</Text>
            <Text style={styles.vocabularyTerm}>
              {realtime.vocabulary.term}
            </Text>
            <Text style={styles.vocabularyMeaning}>
              {realtime.vocabulary.meaningVi}
            </Text>
            {realtime.vocabulary.example ? (
              <Text style={styles.vocabularyExample}>
                {realtime.vocabulary.example}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isActive && realtime.history.length > 0 ? (
          <View style={styles.historyPanel}>
            <Pressable onPress={() => setHistoryOpen(open => !open)}>
              <Text style={styles.historyToggle}>
                {historyOpen
                  ? 'HIDE EARLIER LINES'
                  : `SHOW EARLIER LINES (${realtime.history.length})`}
              </Text>
            </Pressable>
            {historyOpen ? (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.historyScroll}
              >
                {realtime.history.map(line => (
                  <View key={line.id} style={styles.historyRow}>
                    <Text style={styles.historyRole}>
                      {line.role === 'user' ? 'YOU' : 'TUTOR'}
                    </Text>
                    <Text style={styles.historyText}>{line.text}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {!isActive && realtime.analysisLoading && !realtime.analysis ? (
          <View style={styles.reportPanel}>
            <ActivityIndicator color="#55ddb6" />
            <Text style={styles.reportLoading}>
              Analyzing your conversation…
            </Text>
          </View>
        ) : null}
        {!isActive && realtime.analysis?.status === 'COMPLETED' ? (
          <SessionReport report={realtime.analysis} />
        ) : null}
        {!isActive && realtime.analysis?.status === 'FAILED' ? (
          <View style={styles.reportPanel}>
            <Text style={styles.panelTitle}>REPORT UNAVAILABLE</Text>
            <Text style={styles.reportText}>
              {realtime.analysis.errorMessage}
            </Text>
            <Pressable
              onPress={realtime.retryAnalysis}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>RETRY ANALYSIS</Text>
            </Pressable>
          </View>
        ) : null}

        <View>
          <Pressable
            disabled={
              realtime.status === 'connecting' || isEnrolling
            }
            onPress={() =>
              isActive
                ? realtime.stop()
                : realtime.start(auth.accessToken, { conversationMode })
            }
            style={({ pressed }) => [
              styles.callButton,
              isActive && styles.endButton,
              isEnrolling && styles.disabledButton,
              pressed && styles.buttonPressed,
            ]}
          >
            {realtime.status === 'connecting' ? (
              <ActivityIndicator color="#07111f" />
            ) : (
              <Text style={styles.callButtonText}>
                {isActive ? 'END SESSION' : 'START GEMINI LIVE'}
              </Text>
            )}
          </Pressable>
          <Pressable
            disabled={isActive || assistantStatus?.wakeArmed}
            onPress={() => setAuth(undefined)}
          >
            <Text
              style={[
                styles.switchText,
                (isActive || assistantStatus?.wakeArmed) && styles.disabledText,
              ]}
            >
              Sign out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111f' },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sessionContainer: {
    flexGrow: 1,
    gap: 24,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  eyebrow: {
    color: '#55ddb6',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 14,
  },
  title: {
    color: '#f7fbff',
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 43,
    marginBottom: 12,
  },
  welcome: {
    color: '#f7fbff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    color: '#a9b7ca',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 28,
  },
  input: {
    backgroundColor: '#111f31',
    borderColor: '#26394f',
    borderRadius: 14,
    borderWidth: 1,
    color: '#f7fbff',
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#55ddb6',
    borderRadius: 16,
    marginTop: 8,
    paddingVertical: 17,
  },
  primaryButtonText: { color: '#07111f', fontSize: 16, fontWeight: '800' },
  switchText: {
    color: '#a9b7ca',
    fontSize: 14,
    paddingVertical: 20,
    textAlign: 'center',
  },
  error: { color: '#ff8f8f', fontSize: 14, marginBottom: 8 },
  assistantPanel: {
    backgroundColor: '#111f31',
    borderColor: '#26394f',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  panelTitle: {
    color: '#55ddb6',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  panelText: { color: '#a9b7ca', lineHeight: 21, marginVertical: 10 },
  enrollmentScript: {
    backgroundColor: '#0b1727',
    borderColor: '#365069',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14,
  },
  enrollmentScriptTitle: {
    color: '#55ddb6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  enrollmentScriptText: {
    color: '#f7fbff',
    fontSize: 17,
    lineHeight: 26,
  },
  enrollmentScriptHint: {
    color: '#a9b7ca',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  profileWarning: { color: '#ffd28a', lineHeight: 20, marginBottom: 10 },
  profileRow: {
    borderTopColor: '#26394f',
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 12,
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  profileName: { color: '#f7fbff', fontSize: 12, fontWeight: '800' },
  profileState: { color: '#74839a', fontSize: 11, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#55ddb6',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: '#55ddb6', fontWeight: '800' },
  statusPanel: { alignItems: 'center' },
  modeTitle: {
    color: '#74839a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  modeScroller: { flexGrow: 0, marginBottom: 24, maxWidth: '100%' },
  modeChip: {
    borderColor: '#26394f',
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  modeChipSelected: { backgroundColor: '#55ddb6', borderColor: '#55ddb6' },
  modeChipText: { color: '#a9b7ca', fontSize: 13, fontWeight: '700' },
  modeChipTextSelected: { color: '#07111f' },
  pulse: {
    backgroundColor: '#55ddb6',
    borderRadius: 50,
    height: 76,
    marginBottom: 22,
    width: 76,
  },
  pulseError: { backgroundColor: '#ff6767' },
  statusText: { color: '#f7fbff', fontSize: 27, fontWeight: '800' },
  statusHint: {
    color: '#a9b7ca',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 9,
    minHeight: 44,
    textAlign: 'center',
  },
  captionPanel: {
    backgroundColor: '#111f31',
    borderColor: '#26394f',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  captionLabel: {
    color: '#74839a',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  captionScroll: { maxHeight: 132 },
  captionText: { color: '#f7fbff', fontSize: 17, lineHeight: 25 },
  warningPanel: {
    backgroundColor: '#2a1a12',
    borderColor: '#ffb4ad',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  warningTitle: {
    color: '#ffb4ad',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  warningText: { color: '#f7fbff', fontSize: 15, lineHeight: 22 },
  captionHighlight: {
    backgroundColor: '#55ddb6',
    color: '#07111f',
    fontWeight: '800',
  },
  vocabularyPanel: {
    backgroundColor: '#111f31',
    borderColor: '#55ddb6',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  vocabularyTerm: {
    color: '#55ddb6',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },
  vocabularyMeaning: { color: '#f7fbff', fontSize: 16, lineHeight: 23 },
  vocabularyExample: {
    color: '#a9b7ca',
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 8,
  },
  historyPanel: {
    backgroundColor: '#111f31',
    borderColor: '#26394f',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  historyToggle: {
    color: '#55ddb6',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  historyScroll: { maxHeight: 220, marginTop: 12 },
  historyRow: { marginBottom: 12 },
  historyRole: {
    color: '#74839a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
  },
  historyText: { color: '#f7fbff', fontSize: 15, lineHeight: 22 },
  callButton: {
    alignItems: 'center',
    backgroundColor: '#55ddb6',
    borderRadius: 22,
    paddingVertical: 20,
  },
  endButton: { backgroundColor: '#ff7b70' },
  callButtonText: { color: '#07111f', fontSize: 17, fontWeight: '900' },
  buttonPressed: { opacity: 0.82 },
  disabledButton: { opacity: 0.35 },
  disabledText: { opacity: 0.35 },
  textButton: { marginTop: 4 },
  reportPanel: {
    backgroundColor: '#111f31',
    borderColor: '#26394f',
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  reportLoading: {
    color: '#a9b7ca',
    marginTop: 12,
    textAlign: 'center',
  },
  reportSummary: {
    color: '#f7fbff',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
  },
  reportSection: { marginTop: 16 },
  reportSectionTitle: {
    color: '#55ddb6',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  reportItem: { marginBottom: 10 },
  reportText: { color: '#a9b7ca', lineHeight: 21 },
  reportOriginal: { color: '#ffb4ad', lineHeight: 21 },
  reportSuggestion: { color: '#f7fbff', lineHeight: 21 },
  reportTerm: { color: '#f7fbff', fontWeight: '800' },
});

export default App;
