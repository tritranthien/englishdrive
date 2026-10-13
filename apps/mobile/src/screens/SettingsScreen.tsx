import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import AudioLines from 'lucide-react-native/icons/audio-lines';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import LogOut from 'lucide-react-native/icons/log-out';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Mic from 'lucide-react-native/icons/mic';
import UserRound from 'lucide-react-native/icons/user-round';
import type { LucideIcon } from 'lucide-react-native';
import { styles } from './styles';
import type { useLiveConversation } from '../features/live-conversation/hooks/useLiveConversation';
import type { AuthResult, ConversationMode } from '../api/client';
import type { useSpeakerVerification } from '../features/speaker-verification/useSpeakerVerification';
import { SpeakerMatchSettings } from '../features/speaker-verification/SpeakerMatchSettings';
import type { AssistantStatus } from '../native/commute-audio';

export type SettingsDetail =
  | 'VoiceSettings'
  | 'AssistantSettings'
  | 'ConversationMode';
const microphoneLabels = { phone: 'điện thoại', headset: 'tai nghe' } as const;

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

export type SettingsProps = {
  user: AuthResult['user'];
  onOpen: (screen: SettingsDetail) => void;
  realtime: ReturnType<typeof useLiveConversation>;
  speakerVerification: ReturnType<typeof useSpeakerVerification>;
  assistantStatus?: AssistantStatus;
  assistantError?: string;
  conversationMode: ConversationMode;
  setConversationMode: (mode: ConversationMode) => void;
  requestAssistantRole: () => Promise<void>;
  toggleWakePhrase: () => Promise<void>;
  signOut: () => Promise<void>;
  authLoading: boolean;
};

function SettingsRow({
  title,
  subtitle,
  icon: Icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        pressed && styles.buttonPressed,
      ]}
    >
      <View style={styles.settingsIcon}>
        <Icon size={21} color="#55ddb6" strokeWidth={1.8} />
      </View>
      <View style={styles.settingsRowContent}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        <Text style={styles.settingsRowSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color="#74839a" />
    </Pressable>
  );
}

export function SettingsScreen({
  user,
  conversationMode,
  assistantStatus,
  onOpen,
  realtime,
  authLoading,
  signOut,
  speakerVerification,
}: SettingsProps) {
  const disabled =
    authLoading ||
    realtime.isActive ||
    assistantStatus?.wakeArmed ||
    speakerVerification.status?.enrolling;
  return (
    <ScrollView
      testID="screen-settings"
      contentContainerStyle={styles.sessionContainer}
    >
      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}>
          <UserRound size={26} color="#55ddb6" />
        </View>
        <View style={styles.settingsRowContent}>
          <Text style={styles.accountName}>{user.name}</Text>
          <Text style={styles.settingsRowSubtitle}>{user.email}</Text>
        </View>
      </View>
      <Text style={styles.sectionLabel}>TRẢI NGHIỆM HỌC</Text>
      <View style={styles.settingsGroup}>
        <SettingsRow
          icon={MessageCircle}
          title="Chế độ hội thoại"
          subtitle={
            conversationModes.find(item => item.value === conversationMode)
              ?.label ?? ''
          }
          onPress={() => onOpen('ConversationMode')}
        />
      </View>
      <Text style={styles.sectionLabel}>GIỌNG NÓI & TRỢ LÝ</Text>
      <View style={styles.settingsGroup}>
        <SettingsRow
          icon={Mic}
          title="Bộ lọc giọng nói"
          subtitle="Mẫu giọng, ngưỡng khớp và kiểm tra mic"
          onPress={() => onOpen('VoiceSettings')}
        />
        <View style={styles.settingsDivider} />
        <SettingsRow
          icon={AudioLines}
          title="Hey English Drive"
          subtitle={
            assistantStatus?.wakeArmed
              ? 'Đang lắng nghe câu gọi'
              : 'Trợ lý mặc định và câu gọi'
          }
          onPress={() => onOpen('AssistantSettings')}
        />
      </View>
      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Học khi di chuyển</Text>
        <Text style={styles.settingsRowSubtitle}>
          Bạn có thể khóa màn hình khi đang trò chuyện. Dùng tai nghe để nghe rõ
          và nói ngắt lời trợ lý.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đăng xuất"
        disabled={disabled}
        onPress={signOut}
        style={({ pressed }) => [
          styles.signOutButton,
          disabled && styles.disabledButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <LogOut size={18} color="#ff8f8f" />
        <Text style={styles.signOutText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  );
}

export function AssistantSettingsScreen({
  assistantStatus,
  assistantError,
  realtime,
  requestAssistantRole,
  toggleWakePhrase,
}: SettingsProps) {
  return (
    <ScrollView
      testID="screen-assistant-settings"
      contentContainerStyle={styles.sessionContainer}
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
            disabled={!assistantStatus?.roleAvailable || realtime.isActive}
            onPress={requestAssistantRole}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>CHỌN LÀM TRỢ LÝ</Text>
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
    </ScrollView>
  );
}

export function VoiceSettingsScreen({
  realtime,
  speakerVerification,
  assistantStatus,
}: SettingsProps) {
  const isActive = realtime.isActive;
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
  return (
    <ScrollView
      testID="screen-voice-settings"
      contentContainerStyle={styles.sessionContainer}
    >
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
            Trước khi ghi mẫu giọng: chọn đúng mic sẽ dùng khi trò chuyện, ở nơi
            yên tĩnh và tắt nhạc. Giữ khoảng cách đến mic như khi sử dụng thực
            tế. Đọc bằng giọng và âm lượng bình thường; không thì thầm, hét hoặc
            cố đổi giọng.
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
              Đọc cả tiếng Việt và tiếng Anh theo cách bạn thường nói; không cần
              bắt chước giọng bản xứ. Ngắt nhẹ giữa các câu, tránh dừng lâu.
              Tiếp tục đọc đến 100%; nếu còn thiếu, đọc lại từ đầu.
            </Text>
          </View>
        ) : null}
        {speakerVerification.status?.needsReenrollment ? (
          <Text style={styles.profileWarning}>
            Mẫu giọng cũ không còn phù hợp với bộ lọc hiện tại. Hãy ghi lại mẫu.
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
                      {kind === 'phone' ? 'MIC ĐIỆN THOẠI' : 'MIC TAI NGHE'}
                    </Text>
                    <Text style={styles.profileState}>
                      {enrolled ? 'ĐÃ GHI MẪU' : 'CHƯA GHI MẪU'}
                      {selected ? ' · ĐANG DÙNG' : ''}
                    </Text>
                  </View>
                  {speakerVerification.status?.thresholds?.[kind] ? (
                    <SpeakerMatchSettings
                      settings={speakerVerification.status.thresholds[kind]}
                      match={
                        selected &&
                        speakerVerification.match?.profileKind === kind
                          ? speakerVerification.match
                          : undefined
                      }
                      active={selected && isActive}
                      enabled={
                        !!enrolled && !speakerVerification.status.enrolling
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
                          (isActive || speakerVerification.status?.enrolling) &&
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
    </ScrollView>
  );
}

export function ConversationModeScreen({
  realtime,
  conversationMode,
  setConversationMode,
}: SettingsProps) {
  const isActive = realtime.isActive;
  return (
    <ScrollView
      testID="screen-conversation-mode"
      contentContainerStyle={styles.sessionContainer}
    >
      <Text style={styles.panelText}>
        {isActive
          ? 'Kết thúc hội thoại để đổi chủ đề cho buổi học tiếp theo.'
          : 'Chọn chủ đề bạn muốn luyện tập trong buổi học tiếp theo.'}
      </Text>
      <View style={styles.settingsGroup}>
        {conversationModes.map(item => (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityLabel={item.label}
            accessibilityState={{
              checked: conversationMode === item.value,
              disabled: isActive,
            }}
            disabled={isActive}
            onPress={() => setConversationMode(item.value)}
            style={[styles.settingsRow, isActive && styles.disabledButton]}
          >
            <Text style={[styles.settingsRowTitle, styles.settingsRowContent]}>
              {item.label}
            </Text>
            <View
              style={[
                styles.radio,
                conversationMode === item.value && styles.radioSelected,
              ]}
            >
              {conversationMode === item.value ? (
                <View style={styles.radioDot} />
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
