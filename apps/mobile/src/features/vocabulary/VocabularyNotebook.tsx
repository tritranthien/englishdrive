import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { VocabularyHighlight } from '../live-conversation/types/liveConversation.types';
import type { SavedVocabulary } from './vocabulary.store';

type Props = {
  items: SavedVocabulary[];
  loading: boolean;
  saving: boolean;
  error?: string;
  reportWords?: VocabularyHighlight[] | null;
  onSave(words: VocabularyHighlight[]): Promise<void>;
  onRemove(key: string): Promise<void>;
  onReload(): Promise<void>;
};

export function VocabularyNotebook({
  items,
  loading,
  saving,
  error,
  reportWords,
  onSave,
  onRemove,
  onReload,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const [meaningVi, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('vi');
    return items.filter(item =>
      `${item.term} ${item.meaningVi} ${item.example ?? ''}`
        .toLocaleLowerCase('vi')
        .includes(search),
    );
  }, [items, query]);
  async function add() {
    try {
      await onSave([{ term, meaningVi, example }]);
      setTerm('');
      setMeaning('');
      setExample('');
      setAdding(false);
    } catch {
      /* The notebook shows the persistent storage error. */
    }
  }
  function remove(item: SavedVocabulary) {
    Alert.alert(
      'Xóa từ đã lưu?',
      `Xóa “${item.term}” khỏi sổ từ vựng của tài khoản trên mọi thiết bị?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => {
            void onRemove(item.key).catch(() => {});
          },
        },
      ],
    );
  }
  return (
    <View style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sổ từ vựng"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!open) void onReload().catch(() => {});
          setOpen(value => !value);
        }}
        style={styles.toggle}
      >
        <Text style={styles.title}>SỔ TỪ VỰNG ({items.length})</Text>
        <Text style={styles.link}>
          {open ? 'Thu gọn ▴' : 'Xem từ đã lưu ▾'}
        </Text>
      </Pressable>
      {loading || saving ? (
        <ActivityIndicator size="small" color="#55ddb6" />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {error ? (
        <Pressable
          onPress={() => {
            void onReload().catch(() => {});
          }}
        >
          <Text style={styles.link}>Tải lại sổ từ</Text>
        </Pressable>
      ) : null}
      {open ? (
        <>
          <Text style={styles.hint}>
            Từ trợ lý giải thích được lưu tự động trên backend theo tài khoản,
            gồm nghĩa và ví dụ. Đăng nhập cùng tài khoản trên thiết bị khác để
            xem lại. Từ chưa gửi được sẽ chờ đồng bộ khi mở hoặc tải lại sổ. Bạn
            có thể nói “Lưu giúp tôi từ commute” hoặc “Lưu từ vừa rồi”. Trợ lý
            chỉ báo đã lưu khi nhận được xác nhận từ backend.
          </Text>
          <TextInput
            accessibilityLabel="Tìm từ đã lưu"
            placeholder="Tìm từ, nghĩa hoặc ví dụ…"
            placeholderTextColor="#6d7d93"
            value={query}
            onChangeText={value => {
              setQuery(value);
              setLimit(30);
            }}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              disabled={saving}
              onPress={() => {
                void onReload().catch(() => {});
              }}
              style={styles.action}
            >
              <Text style={styles.link}>Đồng bộ sổ từ</Text>
            </Pressable>
            <Pressable
              onPress={() => setAdding(value => !value)}
              style={styles.action}
            >
              <Text style={styles.link}>
                {adding ? 'Đóng phần thêm từ' : '+ Thêm từ'}
              </Text>
            </Pressable>
            {reportWords?.length ? (
              <Pressable
                disabled={saving}
                onPress={() => {
                  void onSave(reportWords).catch(() => {});
                }}
                style={styles.action}
              >
                <Text style={styles.link}>Lưu từ trong tổng kết</Text>
              </Pressable>
            ) : null}
          </View>
          {adding ? (
            <View style={styles.form}>
              <TextInput
                accessibilityLabel="Từ hoặc cụm từ"
                placeholder="Từ hoặc cụm từ tiếng Anh"
                placeholderTextColor="#6d7d93"
                value={term}
                onChangeText={setTerm}
                maxLength={120}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Nghĩa tiếng Việt"
                placeholder="Nghĩa tiếng Việt"
                placeholderTextColor="#6d7d93"
                value={meaningVi}
                onChangeText={setMeaning}
                maxLength={1000}
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Ví dụ của từ"
                placeholder="Ví dụ (không bắt buộc)"
                placeholderTextColor="#6d7d93"
                value={example}
                onChangeText={setExample}
                maxLength={2000}
                multiline
                style={styles.input}
              />
              <Pressable
                disabled={saving || !term.trim() || !meaningVi.trim()}
                onPress={add}
                style={styles.action}
              >
                <Text
                  style={[
                    styles.link,
                    (saving || !term.trim() || !meaningVi.trim()) &&
                      styles.disabled,
                  ]}
                >
                  Lưu từ
                </Text>
              </Pressable>
            </View>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <Text style={styles.hint}>
              {query
                ? 'Không tìm thấy từ phù hợp.'
                : 'Chưa có từ đã lưu. Trò chuyện hoặc thêm từ để bắt đầu sổ từ vựng.'}
            </Text>
          ) : null}
          {filtered.slice(0, limit).map(item => (
            <View key={item.key} style={styles.word}>
              <Text selectable style={styles.term}>
                {item.term}
              </Text>
              <Text selectable style={styles.meaning}>
                {item.meaningVi}
              </Text>
              {item.example ? (
                <Text selectable style={styles.example}>
                  {item.example}
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel={`Xóa từ ${item.term}`}
                disabled={saving}
                onPress={() => remove(item)}
                style={styles.delete}
              >
                <Text style={styles.deleteText}>Xóa</Text>
              </Pressable>
            </View>
          ))}
          {filtered.length > limit ? (
            <Pressable
              onPress={() => setLimit(value => value + 30)}
              style={styles.action}
            >
              <Text style={styles.link}>
                Xem thêm ({filtered.length - limit})
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginVertical: 10,
    padding: 14,
    backgroundColor: '#102236',
    borderRadius: 14,
  },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { color: '#55ddb6', fontSize: 13, fontWeight: '800' },
  link: { color: '#55ddb6', fontSize: 13, lineHeight: 20 },
  hint: { color: '#a9b7ca', fontSize: 13, lineHeight: 20, marginTop: 8 },
  input: {
    backgroundColor: '#0b1727',
    color: '#f7fbff',
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center' },
  form: { marginBottom: 12 },
  word: {
    borderTopWidth: 1,
    borderTopColor: '#365069',
    paddingTop: 12,
    marginTop: 10,
  },
  term: { color: '#55ddb6', fontSize: 19, fontWeight: '700' },
  meaning: { color: '#f7fbff', fontSize: 15, lineHeight: 23, marginTop: 4 },
  example: {
    color: '#a9b7ca',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    marginTop: 4,
  },
  delete: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  deleteText: { color: '#ffb4ad', fontSize: 12 },
  error: { color: '#ffb4ad', lineHeight: 20, marginVertical: 8 },
  disabled: { opacity: 0.4 },
});
