import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import BookOpen from 'lucide-react-native/icons/book-open';
import Plus from 'lucide-react-native/icons/plus';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';
import Trash2 from 'lucide-react-native/icons/trash';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import type { VocabularyDeck } from '../../api/client';
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
  decks: VocabularyDeck[];
  deckId: string | null;
  onMove(keys: string[], deckId: string | null): Promise<void>;
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
  decks,
  deckId,
  onMove,
}: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState('');
  const [meaningVi, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [moving, setMoving] = useState(false);
  function select(key: string) {
    setSelected(keys =>
      keys.includes(key)
        ? keys.filter(item => item !== key)
        : keys.length < 100
          ? [...keys, key]
          : keys,
    );
  }
  async function moveTo(target: string | null) {
    try {
      await onMove(selected, target);
      setSelected([]);
      setSelecting(false);
      setMoving(false);
    } catch {
      /* The hook displays the mutation error. */
    }
  }
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
            onRemove(item.key).catch(() => {});
          },
        },
      ],
    );
  }
  const header = (
    <View style={styles.header}>
      <View style={styles.summary}>
        <Text style={styles.count}>{items.length} từ đã lưu</Text>
        <Text style={styles.hint}>Các từ và ví dụ trong bộ này.</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selecting ? 'Hủy chọn từ' : 'Chọn từ'}
          disabled={saving}
          onPress={() => {
            Keyboard.dismiss();
            setSelecting(value => !value);
            setSelected([]);
            setAdding(false);
          }}
          style={styles.action}
        >
          <Text style={styles.link}>
            {selecting ? 'Hủy chọn' : 'Chọn từ để chuyển bộ'}
          </Text>
        </Pressable>
        {selecting ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chuyển từ sang bộ"
            disabled={saving || selected.length === 0}
            onPress={() => {
              Keyboard.dismiss();
              setMoving(true);
            }}
            style={[
              styles.action,
              (saving || selected.length === 0) && styles.disabled,
            ]}
          >
            <Text style={styles.link}>Chuyển bộ ({selected.length})</Text>
          </Pressable>
        ) : null}
      </View>
      {selecting ? (
        <Text style={styles.hint}>Chọn tối đa 100 từ mỗi lần chuyển.</Text>
      ) : null}
      <View style={styles.search}>
        <Search size={19} color="#74839a" />
        <TextInput
          accessibilityLabel="Tìm từ đã lưu"
          placeholder="Tìm từ, nghĩa hoặc ví dụ…"
          placeholderTextColor="#74839a"
          value={query}
          onChangeText={value => {
            setQuery(value);
            setLimit(30);
          }}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa tìm kiếm"
            onPress={() => {
              setQuery('');
              setLimit(30);
            }}
            style={styles.iconButton}
          >
            <X size={17} color="#a9b7ca" />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thêm từ"
          onPress={() => setAdding(value => !value)}
          style={styles.addButton}
        >
          {adding ? (
            <X size={17} color="#07111f" />
          ) : (
            <Plus size={17} color="#07111f" />
          )}
          <Text style={styles.addButtonText}>
            {adding ? 'Đóng phần thêm từ' : 'Thêm từ'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đồng bộ sổ từ"
          disabled={saving}
          onPress={() => {
            onReload().catch(() => {});
          }}
          style={styles.syncButton}
        >
          {loading || saving ? (
            <ActivityIndicator size="small" color="#55ddb6" />
          ) : (
            <RefreshCw size={17} color="#a9b7ca" />
          )}
          <Text style={styles.syncText}>Đồng bộ</Text>
        </Pressable>
      </View>
      {error ? (
        <View style={styles.errorPanel}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onReload().catch(() => {});
            }}
            style={styles.action}
          >
            <Text style={styles.link}>Thử lại</Text>
          </Pressable>
        </View>
      ) : null}
      {reportWords?.length ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => {
            onSave(reportWords).catch(() => {});
          }}
          style={styles.action}
        >
          <Text style={styles.link}>Lưu từ trong tổng kết</Text>
        </Pressable>
      ) : null}
      {adding ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Thêm vào sổ từ</Text>
          <TextInput
            accessibilityLabel="Từ hoặc cụm từ"
            placeholder="Từ hoặc cụm từ tiếng Anh"
            placeholderTextColor="#74839a"
            value={term}
            onChangeText={setTerm}
            maxLength={120}
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Nghĩa tiếng Việt"
            placeholder="Nghĩa tiếng Việt"
            placeholderTextColor="#74839a"
            value={meaningVi}
            onChangeText={setMeaning}
            maxLength={1000}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Ví dụ của từ"
            placeholder="Ví dụ (không bắt buộc)"
            placeholderTextColor="#74839a"
            value={example}
            onChangeText={setExample}
            maxLength={2000}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lưu từ"
            disabled={saving || !term.trim() || !meaningVi.trim()}
            onPress={add}
            style={[
              styles.addButton,
              styles.saveButton,
              (saving || !term.trim() || !meaningVi.trim()) && styles.disabled,
            ]}
          >
            <Text style={styles.addButtonText}>Lưu từ</Text>
          </Pressable>
        </View>
      ) : null}
      {query ? (
        <Text style={styles.hint}>{filtered.length} kết quả</Text>
      ) : null}
    </View>
  );
  return (
    <View style={styles.container}>
      <FlatList
        testID="vocabulary-list"
        data={filtered.slice(0, limit)}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading || saving}
            onRefresh={() => {
              onReload().catch(() => {});
            }}
            colors={['#55ddb6']}
            tintColor="#55ddb6"
            progressBackgroundColor="#111f31"
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <BookOpen size={30} color="#55ddb6" strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>
                {query
                  ? 'Không tìm thấy từ phù hợp'
                  : 'Sổ từ của bạn bắt đầu ở đây'}
              </Text>
              <Text style={styles.emptyHint}>
                {query
                  ? 'Thử tìm bằng một từ hoặc nghĩa khác.'
                  : 'Trò chuyện với trợ lý hoặc thêm từ mới để lưu lại những điều bạn đã học.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.word}>
            <View style={styles.wordHeader}>
              <Text selectable style={styles.term}>
                {item.term}
              </Text>
              {selecting ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Chọn từ ${item.term}`}
                  accessibilityState={{ checked: selected.includes(item.key) }}
                  disabled={saving}
                  onPress={() => select(item.key)}
                  style={styles.iconButton}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected.includes(item.key) && styles.checkboxSelected,
                    ]}
                  >
                    {selected.includes(item.key) ? (
                      <Check size={15} color="#07111f" />
                    ) : null}
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Xóa từ ${item.term}`}
                  disabled={saving}
                  onPress={() => remove(item)}
                  style={styles.iconButton}
                >
                  <Trash2 size={17} color="#74839a" />
                </Pressable>
              )}
            </View>
            <Text selectable style={styles.meaning}>
              {item.meaningVi}
            </Text>
            {item.example ? (
              <View style={styles.examplePanel}>
                <Text selectable style={styles.example}>
                  {item.example}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          filtered.length > limit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLimit(value => value + 30)}
              style={styles.moreButton}
            >
              <Text style={styles.link}>
                Xem thêm ({filtered.length - limit})
              </Text>
            </Pressable>
          ) : undefined
        }
      />
      <Modal
        visible={moving}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!saving) setMoving(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalPanel}>
            <Text style={styles.emptyTitle}>
              Chuyển {selected.length} từ sang bộ
            </Text>
            <Text style={styles.hint}>
              Mỗi từ sẽ thuộc bộ mới sau khi chuyển.
            </Text>
            <FlatList
              data={[
                { id: null as string | null, name: 'Chưa phân loại' },
                ...decks,
              ]}
              keyExtractor={deck => deck.id ?? 'unclassified'}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Chuyển vào bộ ${item.name}`}
                  disabled={saving || item.id === deckId}
                  onPress={() => {
                    moveTo(item.id).catch(() => {});
                  }}
                  style={[
                    styles.deckChoice,
                    (saving || item.id === deckId) && styles.disabled,
                  ]}
                >
                  <Text style={styles.meaning}>
                    {item.name}
                    {item.id === deckId ? ' · Bộ hiện tại' : ''}
                  </Text>
                </Pressable>
              )}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {saving ? <ActivityIndicator color="#55ddb6" /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hủy chuyển bộ"
              disabled={saving}
              onPress={() => setMoving(false)}
              style={styles.moreButton}
            >
              <Text style={styles.link}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#74839a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: '#55ddb6', borderColor: '#55ddb6' },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  modalPanel: {
    backgroundColor: '#111f31',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    maxHeight: '75%',
    height: '65%',
  },
  deckChoice: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#233247',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  list: { flexGrow: 1, padding: 20, gap: 12, paddingBottom: 28 },
  header: { gap: 16, paddingBottom: 4 },
  summary: { gap: 5 },
  count: { color: '#55ddb6', fontSize: 13, fontWeight: '600' },
  hint: { color: '#8190a5', fontSize: 13, lineHeight: 20 },
  search: {
    backgroundColor: '#111f31',
    borderColor: '#233247',
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    color: '#f7fbff',
    minHeight: 48,
    flex: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 12,
    backgroundColor: '#55ddb6',
  },
  addButtonText: { color: '#07111f', fontSize: 13, fontWeight: '700' },
  syncButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  syncText: { color: '#a9b7ca', fontSize: 13 },
  link: { color: '#55ddb6', fontSize: 13, fontWeight: '600', lineHeight: 20 },
  action: { minHeight: 44, justifyContent: 'center' },
  input: {
    backgroundColor: '#07111f',
    borderColor: '#233247',
    borderWidth: 1,
    color: '#f7fbff',
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  form: {
    padding: 16,
    gap: 12,
    backgroundColor: '#111f31',
    borderRadius: 16,
    borderColor: '#233247',
    borderWidth: 1,
  },
  formTitle: { color: '#f7fbff', fontSize: 15, fontWeight: '700' },
  saveButton: { alignSelf: 'flex-start' },
  word: {
    borderWidth: 1,
    borderColor: '#233247',
    backgroundColor: '#111f31',
    padding: 16,
    borderRadius: 16,
  },
  wordHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  term: { color: '#f7fbff', fontSize: 18, fontWeight: '700', flex: 1 },
  meaning: { color: '#c4cede', fontSize: 14, lineHeight: 22, marginTop: 2 },
  examplePanel: {
    marginTop: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#31574f',
    paddingLeft: 12,
  },
  example: { color: '#8190a5', fontSize: 13, lineHeight: 21 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  errorPanel: { padding: 12, borderRadius: 12, backgroundColor: '#2a1a1a' },
  error: { color: '#ff8f8f', fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.4 },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 14,
  },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#12352f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: '#f7fbff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyHint: {
    color: '#8190a5',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});
