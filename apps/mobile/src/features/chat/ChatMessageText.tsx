import React from 'react';
import { Text } from 'react-native';
import { vocabularyTokens } from './ChatVocabularySheet';
import { chatStyles as s } from './chat.styles';

export type WordSelection = {
  start: number;
  end: number;
  x: number;
  y: number;
};

export function ChatMessageText({
  content,
  selected,
  choosingPhrase,
  onSelect,
}: {
  content: string;
  selected?: WordSelection;
  choosingPhrase: boolean;
  onSelect: (selection: WordSelection) => void;
}) {
  const parts: React.ReactNode[] = [];
  let previous = 0;
  vocabularyTokens(content).forEach(word => {
    parts.push(content.slice(previous, word.start));
    parts.push(
      <Text
        key={word.start}
        accessibilityRole="button"
        accessibilityLabel={`Tùy chọn từ ${word.text}`}
        accessibilityHint={
          choosingPhrase ? 'Chạm từ cuối để chọn cụm từ' : 'Chạm để mở tùy chọn'
        }
        onPress={event => {
          onSelect({
            start: word.start,
            end: word.end,
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          });
        }}
        onLongPress={event =>
          onSelect({
            start: word.start,
            end: word.end,
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          })
        }
        accessibilityActions={[{ name: 'activate', label: 'Mở tùy chọn từ' }]}
        onAccessibilityAction={() =>
          onSelect({ start: word.start, end: word.end, x: 20, y: 200 })
        }
        style={
          selected && word.start >= selected.start && word.end <= selected.end
            ? s.selectedWord
            : undefined
        }
      >
        {word.text}
      </Text>,
    );
    previous = word.end;
  });
  parts.push(content.slice(previous));
  return <Text style={s.text}>{parts}</Text>;
}
