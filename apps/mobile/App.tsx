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
import { SpeakerMatchSettings } from './src/features/speaker-verification/SpeakerMatchSettings';
import { commuteAudio, type AssistantStatus } from './src/native/commute-audio';

const microphoneLabels = { phone: 'điện thoại', headset: 'tai nghe' } as const;

const statusLabels = {
  idle: 'Sẵn sàng',
  connecting: 'Đang kết nối…',
  listening: 'Đang lắng nghe',
  'user-speaking': 'Bạn đang nói',
  thinking: 'Đang suy nghĩ…',
  'ai-speaking': 'Trợ lý đang nói',
  reconnecting: 'Đang kết nối lại…',
  disconnected: 'Âm thanh tạm dừng',
  error: 'Lỗi kết nối',
} as const;

const conversationModes: Array<{
  value: ConversationMode;
  label: string;
}> = [
  { value: 'FREE_CONVERSATION', label: 'Trò chuyện tự do' },
  { value: 'DAILY_LIFE', label: 'Cuộc sống hằng ngày' },
  { value: 'WORK_SOFTWARE', label: 'Công việc & phần mềm' },
  { value: 'VOCABULARY_PRACTICE', label: 'Từ vựng' },
  { value: 'GRAMMAR_PRACTICE', label: 'Ngữ pháp' },
  { value: 'ROLE_PLAY', label: 'Đóng vai' },
  { value: 'PRONUNCIATION_PRACTICE', label: 'Phát âm' },
];

const voiceEnrollmentScript = [
  'Xin chào, tôi đang luyện nói. I practice English on my way to work. Bạn có thể nói chậm và giải thích rõ hơn không?',
  'Buổi sáng, tôi thường uống nước rồi chuẩn bị đi làm. Could you give me another example? I would like to try again.',
  'Chiều nay, tôi muốn ghé chợ mua trái cây và bánh mì. That sounds good, thank you. Let us continue our conversation.',
].join('\n\n');

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
      <Text style={styles.panelTitle}>TỔNG KẾT HỘI THOẠI</Text>
      <Text style={styles.reportSummary}>{report.summary}</Text>
      {report.mainTopics?.length ? (
        <ReportSection title="Chủ đề chính">
          <Text style={styles.reportText}>{report.mainTopics.join(' · ')}</Text>
        </ReportSection>
      ) : null}
      {report.grammarIssues?.length ? (
        <ReportSection title="Ngữ pháp">
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
        <ReportSection title="Từ vựng mới">
          {report.newVocabulary.slice(0, 6).map(item => (
            <Text key={item.term} style={styles.reportText}>
              <Text style={styles.reportTerm}>{item.term}</Text> —{' '}
              {item.meaningVi}
            </Text>
          ))}
        </ReportSection>
      ) : null}
      {report.strengths?.length ? (
        <ReportSection title="Điểm làm tốt">
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
        <ReportSection title="Buổi học tiếp theo">
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const realtime = useLiveConversation();
  const speakerVerification = useSpeakerVerification();
  const liveAudioProfileKind =
    realtime.audioRoute.type === 'bluetooth' ||
    realtime.audioRoute.type === 'wired'
      ? 'headset'
      : 'phone';
  const currentVoiceProfileKind = realtime.isActive
    ? liveAudioProfileKind
    : speakerVerification.status?.currentRouteKind ?? liveAudioProfileKind;
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
      setAuth(result);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Không đăng nhập được',
      );
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

  const isActive = realtime.isActive;
  const isEnrolling = speakerVerification.status?.enrolling === true;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.sessionContainer}>
        <View style={styles.sessionHeader}>
          <Text style={styles.panelTitle}>ENGLISH DRIVE</Text>
          <Text style={styles.sessionName}>{auth.user.name}</Text>
        </View>

        {isActive && realtime.filterBypassed ? (
          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>BỘ LỌC GIỌNG NÓI ĐÃ TẮT</Text>
            <Text style={styles.warningText}>
              Giọng nói chưa khớp với mẫu đã ghi nên phiên này đang gửi âm thanh
              mà không lọc giọng. Bạn có thể chỉnh ngưỡng trong Cài đặt để thử
              lại từ câu tiếp theo, hoặc ghi lại mẫu ở nơi yên tĩnh.
            </Text>
          </View>
        ) : null}

        <View style={[styles.captionPanel, styles.userCaptionPanel]}>
          <Text style={[styles.captionLabel, styles.userCaptionLabel]}>
            BẠN NÓI · GEMINI NGHE ĐƯỢC
          </Text>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.captionScroll}
          >
            <Text
              style={
                realtime.userTranscript
                  ? styles.userCaptionText
                  : styles.captionPlaceholder
              }
            >
              {realtime.userTranscript ||
                'Lời nói được Gemini nhận sẽ hiện ở đây.'}
            </Text>
          </ScrollView>
        </View>

        {realtime.assistantTranscript ? (
          <View style={styles.captionPanel}>
            <Text style={styles.captionLabel}>TRỢ LÝ NÓI</Text>
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
            <Text style={styles.captionLabel}>TỪ VỰNG MỚI</Text>
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

        {realtime.history.length > 0 ? (
          <View style={styles.historyPanel}>
            <Pressable onPress={() => setHistoryOpen(open => !open)}>
              <Text style={styles.historyToggle}>
                {historyOpen
                  ? 'ẨN LỊCH SỬ'
                  : `XEM LỊCH SỬ (${realtime.history.length})`}
              </Text>
            </Pressable>
            {historyOpen ? (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                style={styles.historyScroll}
              >
                {realtime.history.map(line => (
                  <View
                    key={line.id}
                    style={[
                      styles.historyRow,
                      line.role === 'user' && styles.userHistoryRow,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyRole,
                        line.role === 'user' && styles.userCaptionLabel,
                      ]}
                    >
                      {line.role === 'user' ? 'BẠN' : 'TRỢ LÝ'}
                    </Text>
                    <Text
                      style={[
                        styles.historyText,
                        line.role === 'user' && styles.userHistoryText,
                      ]}
                    >
                      {line.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {!isActive && realtime.analysisLoading && !realtime.analysis ? (
          <View style={styles.reportPanel}>
            <ActivityIndicator color="#55ddb6" />
            <Text style={styles.reportLoading}>Đang phân tích hội thoại…</Text>
          </View>
        ) : null}
        {!isActive && realtime.analysis?.status === 'COMPLETED' ? (
          <SessionReport report={realtime.analysis} />
        ) : null}
        {!isActive && realtime.analysis?.status === 'FAILED' ? (
          <View style={styles.reportPanel}>
            <Text style={styles.panelTitle}>CHƯA CÓ BÁO CÁO</Text>
            <Text style={styles.reportText}>
              {realtime.analysis.errorMessage}
            </Text>
            <Pressable
              onPress={realtime.retryAnalysis}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>PHÂN TÍCH LẠI</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.statusPanel}>
          <View
            style={[
              styles.pulse,
              realtime.status === 'error' && styles.pulseError,
            ]}
          />
          <Text style={styles.statusText}>{statusLabels[realtime.status]}</Text>
          <Text style={styles.statusHint}>
            {realtime.status === 'idle'
              ? 'Mic chỉ hoạt động sau khi bạn nhấn Bắt đầu.'
              : realtime.status === 'error'
              ? realtime.error
              : realtime.status === 'disconnected'
              ? 'Ứng dụng khác hoặc cuộc gọi đang sử dụng âm thanh'
              : realtime.status === 'reconnecting'
              ? 'Đang khôi phục hội thoại hiện tại'
              : `Đang trò chuyện qua ${realtime.audioRoute.name}`}
          </Text>
        </View>

        <View>
          <Pressable
            disabled={realtime.status === 'connecting' || isEnrolling}
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
                {isActive ? 'Kết thúc' : 'Bắt đầu'}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.settingsPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cài đặt"
            accessibilityState={{
              expanded: settingsOpen || isEnrolling,
              disabled: isEnrolling,
            }}
            disabled={isEnrolling}
            onPress={() => setSettingsOpen(open => !open)}
            style={styles.settingsToggle}
          >
            <Text style={styles.panelTitle}>CÀI ĐẶT</Text>
            <Text style={styles.settingsSummary}>
              {
                conversationModes.find(mode => mode.value === conversationMode)
                  ?.label
              }{' '}
              · {microphoneLabels[currentVoiceProfileKind]}
            </Text>
            <Text style={styles.settingsArrow}>
              {settingsOpen || isEnrolling ? '▴' : '▾'}
            </Text>
          </Pressable>
          <View
            style={[
              styles.settingsContent,
              !(settingsOpen || isEnrolling) && styles.hiddenSettings,
            ]}
            accessibilityElementsHidden={!(settingsOpen || isEnrolling)}
            importantForAccessibility={
              settingsOpen || isEnrolling ? 'auto' : 'no-hide-descendants'
            }
          >
            <View style={styles.assistantPanel}>
              <Text style={styles.panelTitle}>HEY ENGLISH DRIVE</Text>
              <Text style={styles.panelText}>
                {assistantStatus && !assistantStatus.roleAvailable
                  ? 'Cần Android 12 trở lên và hỗ trợ chọn trợ lý mặc định.'
                  : assistantStatus?.isDefaultAssistant
                  ? assistantStatus.onDeviceWakeAvailable
                    ? assistantStatus.wakeArmed
                      ? 'Đã bật. Bạn có thể khóa màn hình và nói “Hey English Drive”.'
                      : 'Sẵn sàng bật nhận diện câu gọi trên thiết bị.'
                    : 'Điện thoại này chưa hỗ trợ nhận diện câu gọi trên thiết bị.'
                  : 'Trước tiên, chọn EnglishDrive làm trợ lý mặc định.'}
              </Text>
              {assistantError ? (
                <Text style={styles.error}>{assistantError}</Text>
              ) : null}
              {!assistantStatus?.isDefaultAssistant ? (
                <Pressable
                  disabled={
                    !assistantStatus?.roleAvailable || realtime.isActive
                  }
                  onPress={requestAssistantRole}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    CHỌN LÀM TRỢ LÝ
                  </Text>
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
                    {assistantStatus.wakeArmed ? 'TẮT CÂU GỌI' : 'BẬT CÂU GỌI'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.assistantPanel}>
              <Text style={styles.panelTitle}>BỘ LỌC GIỌNG NÓI</Text>
              <Text style={styles.panelText}>
                {!speakerVerification.status
                  ? 'Đang kiểm tra bộ lọc giọng nói…'
                  : !speakerVerification.status.configured
                  ? 'Không tìm thấy mô hình giọng nói. Vui lòng cài lại ứng dụng.'
                  : speakerVerification.status.enrolling
                  ? `Đang ghi mẫu giọng cho mic ${
                      microphoneLabels[
                        speakerVerification.status.enrollingKind ??
                          currentVoiceProfileKind
                      ]
                    }. Hãy nói tự nhiên. Hoàn tất ${
                      speakerVerification.progress
                    }%.`
                  : currentVoiceProfileEnrolled
                  ? `Đang lọc giọng qua mic ${microphoneLabels[currentVoiceProfileKind]}. Câu khớp giọng và câu trả lời ngắn kế tiếp được gửi đến Gemini.`
                  : `Chưa có mẫu giọng cho mic ${microphoneLabels[currentVoiceProfileKind]}. Bạn vẫn có thể trò chuyện khi bộ lọc tắt.`}
              </Text>
              {speakerVerification.status?.configured &&
              !speakerVerification.status.enrolling ? (
                <Text style={styles.enrollmentScriptHint}>
                  Trước khi ghi mẫu giọng: chọn đúng mic sẽ dùng khi trò chuyện,
                  ở nơi yên tĩnh và tắt nhạc. Giữ khoảng cách đến mic như khi sử
                  dụng thực tế. Đọc bằng giọng và âm lượng bình thường; không
                  thì thầm, hét hoặc cố đổi giọng.
                </Text>
              ) : null}
              {speakerVerification.status?.enrolling ? (
                <View style={styles.enrollmentScript}>
                  <Text style={styles.enrollmentScriptTitle}>
                    ĐỌC LẦN LƯỢT BẰNG GIỌNG TỰ NHIÊN
                  </Text>
                  <Text style={styles.enrollmentScriptText}>
                    {voiceEnrollmentScript}
                  </Text>
                  <Text style={styles.enrollmentScriptHint}>
                    Đọc cả tiếng Việt và tiếng Anh theo cách bạn thường nói;
                    không cần bắt chước giọng bản xứ. Ngắt nhẹ giữa các câu,
                    tránh dừng lâu. Tiếp tục đọc đến 100%; nếu còn thiếu, đọc
                    lại từ đầu.
                  </Text>
                </View>
              ) : null}
              {speakerVerification.status?.needsReenrollment ? (
                <Text style={styles.profileWarning}>
                  Mẫu giọng cũ không còn phù hợp với bộ lọc hiện tại. Hãy ghi
                  lại mẫu.
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
                              ? 'MIC ĐIỆN THOẠI'
                              : 'MIC TAI NGHE'}
                          </Text>
                          <Text style={styles.profileState}>
                            {enrolled ? 'ĐÃ GHI MẪU' : 'CHƯA GHI MẪU'}
                            {selected ? ' · ĐANG DÙNG' : ''}
                          </Text>
                        </View>
                        {speakerVerification.status?.thresholds?.[kind] ? (
                          <SpeakerMatchSettings
                            settings={
                              speakerVerification.status.thresholds[kind]
                            }
                            match={
                              selected &&
                              speakerVerification.match?.profileKind === kind
                                ? speakerVerification.match
                                : undefined
                            }
                            active={selected && isActive}
                            enabled={
                              !!enrolled &&
                              !speakerVerification.status.enrolling
                            }
                            saving={speakerVerification.savingThreshold}
                            onSave={value =>
                              speakerVerification.setThreshold(kind, value)
                            }
                          />
                        ) : null}
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
                            {enrolled ? 'Ghi lại mẫu giọng' : 'Ghi mẫu giọng'}{' '}
                            {microphoneLabels[kind]}
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
                              Xóa mẫu giọng {microphoneLabels[kind]}
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
                      <Text style={styles.switchText}>Hủy ghi mẫu giọng</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>

            <View style={styles.assistantPanel}>
              <Text style={styles.modeTitle}>CHẾ ĐỘ HỘI THOẠI</Text>
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
                      conversationMode === mode.value &&
                        styles.modeChipSelected,
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
            </View>
            <Text style={styles.panelText}>
              Bạn có thể khóa màn hình sau khi kết nối. Android sẽ hiển thị
              thông báo khi mic đang hoạt động.
            </Text>
            <Pressable
              disabled={isActive || assistantStatus?.wakeArmed}
              onPress={() => setAuth(undefined)}
            >
              <Text
                style={[
                  styles.switchText,
                  (isActive || assistantStatus?.wakeArmed) &&
                    styles.disabledText,
                ]}
              >
                Đăng xuất
              </Text>
            </Pressable>
          </View>
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
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sessionName: { color: '#a9b7ca', fontSize: 13, flexShrink: 1 },
  settingsPanel: {
    backgroundColor: '#0b1727',
    borderColor: '#26394f',
    borderWidth: 1,
    borderRadius: 18,
  },
  settingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 18,
    minHeight: 56,
  },
  settingsSummary: {
    color: '#a9b7ca',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  settingsArrow: { color: '#55ddb6', fontSize: 22 },
  settingsContent: { padding: 12, gap: 16 },
  hiddenSettings: { display: 'none' },
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
    height: 16,
    marginBottom: 8,
    width: 16,
  },
  pulseError: { backgroundColor: '#ff6767' },
  statusText: { color: '#f7fbff', fontSize: 19, fontWeight: '800' },
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
  captionPlaceholder: { color: '#74839a', fontSize: 15, lineHeight: 23 },
  userCaptionPanel: { backgroundColor: '#0d2339', borderColor: '#508bc5' },
  userCaptionLabel: { color: '#91c9ff' },
  userCaptionText: {
    color: '#b4dcff',
    backgroundColor: '#173d61',
    fontSize: 17,
    lineHeight: 26,
  },
  userHistoryRow: { backgroundColor: '#0d2339', borderRadius: 8, padding: 8 },
  userHistoryText: { color: '#b4dcff' },
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
