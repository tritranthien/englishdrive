import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { styles } from './styles';
import type { useLiveConversation } from '../features/live-conversation/hooks/useLiveConversation';
import type {
  AuthResult,
  ConversationMode,
  SessionAnalysisReport,
} from '../api/client';
import type { useVocabulary } from '../features/vocabulary/useVocabulary';
import Mic from 'lucide-react-native/icons/mic';
import { vocabularyKey } from '../features/vocabulary/vocabulary.store';

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

type Props = {
  auth: AuthResult;
  realtime: ReturnType<typeof useLiveConversation>;
  vocabularyNotebook: ReturnType<typeof useVocabulary>;
  conversationMode: ConversationMode;
  isEnrolling: boolean;
};

export function ConversationScreen({
  auth,
  realtime,
  vocabularyNotebook,
  conversationMode,
  isEnrolling,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const isActive = realtime.isActive;
  return (
    <ScrollView
      testID="screen-conversation"
      contentContainerStyle={styles.sessionContainer}
      keyboardShouldPersistTaps="handled"
    >
      {!isActive && !realtime.analysis ? (
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Mic size={23} color="#55ddb6" strokeWidth={1.8} />
          </View>
          <Text style={styles.heroTitle}>
            Một cuộc trò chuyện, một bước tiến mới.
          </Text>
          <Text style={styles.heroSubtitle}>
            Luyện tiếng Anh cùng trợ lý bằng giọng nói. Bắt đầu với chủ đề bạn
            yêu thích.
          </Text>
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
      {isActive && realtime.filterBypassed ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>BỘ LỌC GIỌNG NÓI ĐÃ TẮT</Text>
          <Text style={styles.warningText}>
            Giọng nói chưa khớp với mẫu đã ghi nên phiên này đang gửi âm thanh
            mà không lọc giọng. Bạn có thể chỉnh ngưỡng trong Cài đặt để thử lại
            từ câu tiếp theo, hoặc ghi lại mẫu ở nơi yên tĩnh.
          </Text>
        </View>
      ) : null}

      {isActive || realtime.userTranscript ? (
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
      ) : null}

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
          <Text style={styles.vocabularyTerm}>{realtime.vocabulary.term}</Text>
          <Text style={styles.vocabularyMeaning}>
            {realtime.vocabulary.meaningVi}
          </Text>
          {realtime.vocabulary.example ? (
            <Text style={styles.vocabularyExample}>
              {realtime.vocabulary.example}
            </Text>
          ) : null}
          <Pressable
            disabled={vocabularyNotebook.saving}
            onPress={() => {
              if (realtime.vocabulary) {
                vocabularyNotebook.save([realtime.vocabulary]).catch(() => {});
              }
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {vocabularyNotebook.saving
                ? 'Đang lưu từ…'
                : vocabularyNotebook.items.some(
                      item =>
                        item.key === vocabularyKey(realtime.vocabulary!.term),
                    )
                  ? 'Đã lưu vào sổ từ vựng'
                  : 'Lưu từ vựng'}
            </Text>
          </Pressable>
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
    </ScrollView>
  );
}
