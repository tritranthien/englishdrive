import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { vocabularyTokens } from '../chat/ChatVocabularySheet';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import {
  videoApi,
  type VideoSubtitleCue,
  type VideoVocabularyLookup,
} from './video.api';
import { videoStyles as s } from './video.styles';

export function VideoVocabularySheet({
  token,
  videoId,
  cue,
  onSave,
  onClose,
}: {
  token: string;
  videoId: string;
  cue: VideoSubtitleCue;
  onSave: (words: VocabularyHighlight[]) => Promise<void>;
  onClose: () => void;
}) {
  const tokens = vocabularyTokens(cue.textEn);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [definition, setDefinition] = useState<VideoVocabularyLookup>();
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef(0);

  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  const first = anchor == null ? null : Math.min(anchor, end ?? anchor);
  const last = anchor == null ? null : Math.max(anchor, end ?? anchor);
  const startOffset = first == null ? 0 : tokens[first].start;
  const endOffset = last == null ? 0 : tokens[last].end;
  const term = cue.textEn.slice(startOffset, endOffset);

  function choose(index: number) {
    request.current++;
    if (anchor == null || end != null) {
      setAnchor(index);
      setEnd(null);
    } else {
      setEnd(index);
    }
    setDefinition(undefined);
    setLoading(false);
    setSaved(false);
    setError(undefined);
  }

  async function lookup() {
    if (!term || term.length > 120 || loading) return;
    const version = ++request.current;
    setLoading(true);
    setSaved(false);
    setError(undefined);
    setDefinition(undefined);
    try {
      const result = await videoApi.vocabulary(
        token,
        videoId,
        cue.id,
        startOffset,
        endOffset,
      );
      if (request.current !== version) return;
      setDefinition(result);
      setMeaning(result.meaningVi);
      setExample(result.example);
    } catch (failure) {
      if (request.current === version) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa tra được từ. Hãy thử lại.',
        );
      }
    } finally {
      if (request.current === version) setLoading(false);
    }
  }

  async function save() {
    if (!definition || !meaning.trim() || saving || saved) return;
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
      if (request.current === version) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'Không lưu được từ. Hãy thử lại.',
        );
      }
    } finally {
      if (request.current === version) setSaving(false);
    }
  }

  const action = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.label}>{label}</Text>
    </Pressable>
  );

  const parts: React.ReactNode[] = [];
  let previous = 0;
  tokens.forEach((word, index) => {
    parts.push(cue.textEn.slice(previous, word.start));
    parts.push(
      <Text
        key={word.start}
        accessibilityRole="button"
        accessibilityLabel={`Chọn từ ${word.text} (${index + 1})`}
        onPress={() => {
          if (!saving) choose(index);
        }}
        style={
          first != null && last != null && index >= first && index <= last
            ? s.selectedWord
            : undefined
        }
      >
        {word.text}
      </Text>,
    );
    previous = word.end;
  });
  parts.push(cue.textEn.slice(previous));

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={s.container} behavior="padding">
          <View style={[s.row, s.sheetHeader]}>
            <Text accessibilityRole="header" style={[s.title, s.grow]}>
              Từ vựng trong phụ đề
            </Text>
            {action('Đóng tra từ', onClose)}
          </View>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.hint}>
              Chạm một từ để chọn. Chạm thêm từ cuối để chọn cả cụm; chạm lần
              nữa để chọn lại.
            </Text>
            <View style={s.card}>
              <Text style={s.selectionText}>{parts}</Text>
              <Text style={s.subtitleVi}>{cue.textVi}</Text>
            </View>
            <Text style={s.title}>
              {term || 'Chọn từ hoặc cụm từ trong câu phụ đề'}
            </Text>
            {term.length > 120 && (
              <Text style={s.error}>Hãy chọn tối đa 120 ký tự.</Text>
            )}
            {action(
              loading ? 'Đang tra nghĩa…' : 'Tra nghĩa',
              () => {
                void lookup();
              },
              !term || term.length > 120 || loading || saving,
            )}
            {definition && (
              <View style={s.card}>
                <Text selectable style={s.title}>
                  {definition.term}
                </Text>
                <Text style={s.hint}>
                  {definition.pronunciation} · {definition.partOfSpeech}
                </Text>
                <Text style={s.label}>Nghĩa tiếng Việt</Text>
                <TextInput
                  accessibilityLabel="Nghĩa tiếng Việt của từ đã chọn"
                  value={meaning}
                  onChangeText={(value) => {
                    setMeaning(value);
                    setSaved(false);
                  }}
                  maxLength={1000}
                  multiline
                  editable={!saving}
                  style={s.input}
                />
                <Text style={s.text}>{definition.explanation}</Text>
                <Text style={s.label}>Ví dụ</Text>
                <TextInput
                  accessibilityLabel="Ví dụ của từ đã chọn"
                  value={example}
                  onChangeText={(value) => {
                    setExample(value);
                    setSaved(false);
                  }}
                  maxLength={2000}
                  multiline
                  editable={!saving}
                  style={s.input}
                />
                {action(
                  saved
                    ? 'Đã lưu từ'
                    : saving
                      ? 'Đang lưu từ…'
                      : 'Lưu vào từ vựng',
                  () => {
                    void save();
                  },
                  saved || saving || !meaning.trim(),
                )}
                {saved && (
                  <Text accessibilityLiveRegion="polite" style={s.label}>
                    Đã lưu vào tab Từ vựng.
                  </Text>
                )}
              </View>
            )}
            {error && (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                {error}
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
