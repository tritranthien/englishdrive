import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  chatApi,
  type ChatMessage,
  type ChatVocabularyLookup,
  type ChatHelpResult,
} from './chat.api';
import type { WordSelection } from './ChatMessageText';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import { chatStyles as s } from './chat.styles';

export function ChatWordPopup({
  token,
  message,
  selection,
  onClose,
  onChoosePhrase,
  onHelp,
  onSave,
}: {
  token: string;
  message: ChatMessage;
  selection: WordSelection;
  onClose: () => void;
  onChoosePhrase: () => void;
  onHelp: (action: 'translate' | 'explain') => void;
  onSave: (words: VocabularyHighlight[]) => Promise<void>;
}) {
  const { width, height } = useWindowDimensions();
  const [definition, setDefinition] = useState<ChatVocabularyLookup>();
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [sentence, setSentence] = useState<ChatHelpResult>();
  const [savedTerms, setSavedTerms] = useState<number[]>([]);
  const [savingTerm, setSavingTerm] = useState<number>();
  const [error, setError] = useState<string>();
  const [popupHeight, setPopupHeight] = useState(160);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const term = message.content.slice(selection.start, selection.end);
  async function explainSentence() {
    const version = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await chatApi.help(
        token,
        message.threadId,
        'explain',
        message.id,
      );
      if (request.current === version) {
        setSentence(result);
        setSavedTerms([]);
      }
    } catch (failure) {
      if (request.current === version)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa giải thích được câu',
        );
    } finally {
      if (request.current === version) setLoading(false);
    }
  }
  async function saveExpression(index: number) {
    const word = sentence?.vocabulary?.[index];
    if (!word || savingTerm !== undefined || savedTerms.includes(index)) return;
    const version = request.current;
    setSavingTerm(index);
    setError(undefined);
    try {
      await onSave([word]);
      if (request.current === version)
        setSavedTerms(current => [...current, index]);
    } catch (failure) {
      if (request.current === version)
        setError(
          failure instanceof Error ? failure.message : 'Chưa lưu được từ',
        );
    } finally {
      if (request.current === version) setSavingTerm(undefined);
    }
  }
  async function lookup(explain = false) {
    const version = ++request.current;
    setLoading(true);
    setError(undefined);
    try {
      const result = await chatApi.vocabulary(
        token,
        message.threadId,
        message.id,
        selection.start,
        selection.end,
      );
      if (request.current !== version) return;
      setDefinition(result);
      setMeaning(result.meaningVi);
      setExample(result.example);
      setShowExplanation(explain);
    } catch (failure) {
      if (request.current === version)
        setError(
          failure instanceof Error ? failure.message : 'Chưa dịch được từ',
        );
    } finally {
      if (request.current === version) setLoading(false);
    }
  }
  async function save() {
    if (!definition || saving || saved || !meaning.trim()) return;
    const version = request.current;
    setSaving(true);
    setError(undefined);
    try {
      await onSave([
        {
          term: definition.term,
          meaningVi: meaning.trim(),
          example: example.trim(),
        },
      ]);
      if (request.current === version) setSaved(true);
    } catch (failure) {
      if (request.current === version)
        setError(
          failure instanceof Error ? failure.message : 'Chưa lưu được từ',
        );
    } finally {
      if (request.current === version) setSaving(false);
    }
  }
  const action = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        !definition && !sentence && styles.option,
        disabled && s.disabled,
      ]}
    >
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );
  const popupWidth = Math.min(expanded ? 300 : 248, width - 24);
  const maxHeight = Math.max(
    80,
    Math.min(expanded ? height * 0.6 : 240, height - 64),
  );
  const visibleHeight = Math.min(popupHeight, maxHeight);
  const below = selection.y + 26;
  const top = Math.max(
    24,
    Math.min(
      height - visibleHeight - 24,
      below + visibleHeight <= height - 24
        ? below
        : selection.y - visibleHeight - 26,
    ),
  );
  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <Pressable
          accessibilityLabel="Đóng tùy chọn từ"
          onPress={onClose}
          style={{
            position: 'absolute',
            inset: 0,
          }}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.popover,
            {
              position: 'absolute',
              width: popupWidth,
              left: Math.max(
                12,
                Math.min(width - popupWidth - 12, selection.x - popupWidth / 2),
              ),
              top,
              maxHeight,
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            onContentSizeChange={(_width, contentHeight) =>
              setPopupHeight(contentHeight + 2)
            }
          >
            <View style={styles.header}>
              <Text numberOfLines={1} style={[s.label, s.grow]}>
                {sentence ? 'Giải thích cả câu' : term}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                hitSlop={8}
                onPress={onClose}
                style={styles.close}
              >
                <Text style={s.text}>×</Text>
              </Pressable>
            </View>
            {(definition || sentence) &&
              action(
                'Tùy chọn',
                () => {
                  setDefinition(undefined);
                  setSentence(undefined);
                  setExpanded(false);
                  setSaved(false);
                  setError(undefined);
                },
                saving || savingTerm !== undefined,
              )}
            {!definition && !sentence && (
              <View style={styles.actions}>
                {!definition &&
                  action(
                    loading ? 'Đang dịch…' : 'Dịch từ',
                    () => {
                      void lookup();
                    },
                    loading,
                  )}
                {!definition && action('Chọn cụm', onChoosePhrase)}
                {!definition &&
                  action(
                    loading ? 'Đang tải…' : 'Giải thích từ',
                    () => {
                      void lookup(true);
                    },
                    loading,
                  )}
                {action(
                  'Cả câu',
                  () => {
                    void explainSentence();
                  },
                  loading,
                )}
                {!definition &&
                  action('Sao chép', () => {
                    if (!NativeModules.ChatStorage?.copyText) {
                      setError('Cần cập nhật ứng dụng để sao chép');
                      return;
                    }
                    void NativeModules.ChatStorage.copyText(term)
                      .then(onClose)
                      .catch(() => setError('Chưa sao chép được từ'));
                  })}
                {!definition && message.role === 'CHARACTER' && (
                  <>{action('Dịch tin', () => onHelp('translate'))}</>
                )}
              </View>
            )}
            {sentence && (
              <>
                <Text selectable style={s.hint}>
                  {message.content}
                </Text>
                <Text selectable style={s.text}>
                  {sentence.text}
                </Text>
                {!!sentence.vocabulary?.length && (
                  <Text style={s.label}>Từ & cụm từ</Text>
                )}
                {sentence.vocabulary?.map((word, index) => (
                  <View key={`${index}:${word.term}`} style={styles.expression}>
                    <Text selectable style={s.label}>
                      {word.term}
                    </Text>
                    <Text selectable style={s.text}>
                      {word.meaningVi}
                    </Text>
                    <Text selectable style={s.hint}>
                      {word.example}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Lưu từ ${word.term}`}
                      disabled={
                        savingTerm !== undefined || savedTerms.includes(index)
                      }
                      style={[
                        styles.action,
                        (savingTerm !== undefined ||
                          savedTerms.includes(index)) &&
                          s.disabled,
                      ]}
                      onPress={() => {
                        void saveExpression(index);
                      }}
                    >
                      <Text style={s.label}>
                        {savedTerms.includes(index)
                          ? 'Đã lưu'
                          : savingTerm === index
                            ? 'Đang lưu…'
                            : 'Lưu từ'}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
            {definition && (
              <>
                <Text selectable style={s.text}>
                  {definition.meaningVi}
                </Text>
                <View style={styles.actions}>
                  {action(
                    saved ? 'Đã lưu' : saving ? 'Đang lưu…' : 'Lưu từ',
                    () => {
                      void save();
                    },
                    saved || saving || !meaning.trim(),
                  )}
                  {action(expanded ? 'Thu gọn' : 'Chi tiết', () =>
                    setExpanded(value => !value),
                  )}
                </View>
                {showExplanation && (
                  <>
                    <Text style={s.text}>{definition.explanation}</Text>
                    <Text style={s.hint}>{definition.example}</Text>
                  </>
                )}
                {expanded && (
                  <>
                    <Text style={s.hint}>
                      {definition.pronunciation} · {definition.partOfSpeech}
                    </Text>
                    {!showExplanation && (
                      <Text style={s.text}>{definition.explanation}</Text>
                    )}
                    <TextInput
                      accessibilityLabel="Nghĩa tiếng Việt của từ đã chọn"
                      value={meaning}
                      editable={!saving}
                      onChangeText={value => {
                        setMeaning(value);
                        setSaved(false);
                      }}
                      maxLength={1000}
                      multiline
                      style={s.input}
                    />
                    <TextInput
                      accessibilityLabel="Ví dụ của từ đã chọn"
                      value={example}
                      editable={!saving}
                      onChangeText={value => {
                        setExample(value);
                        setSaved(false);
                      }}
                      maxLength={2000}
                      multiline
                      style={s.input}
                    />
                  </>
                )}
              </>
            )}
            {error && (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {error}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  popover: {
    backgroundColor: '#111f31',
    borderWidth: 1,
    borderColor: '#365069',
    borderRadius: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  content: { padding: 8, gap: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  expression: {
    gap: 4,
    borderTopWidth: 1,
    borderColor: '#365069',
    paddingTop: 8,
  },
  option: { flexGrow: 1, flexBasis: '30%' },
  action: {
    minHeight: 40,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#1a3044',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
