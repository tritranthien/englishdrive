import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Folder from 'lucide-react-native/icons/folder';
import Plus from 'lucide-react-native/icons/plus';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { VocabularyNotebook } from '../features/vocabulary/VocabularyNotebook';
import type { useVocabulary } from '../features/vocabulary/useVocabulary';
import type { useVocabularyDecks } from '../features/vocabulary/useVocabularyDecks';
import type { VocabularyHighlight } from '../features/live-conversation/types/liveConversation.types';

export type VocabularyScreenProps = {
  vocabularyNotebook: ReturnType<typeof useVocabulary>;
  vocabularyDecks: ReturnType<typeof useVocabularyDecks>;
  reportWords?: VocabularyHighlight[] | null;
};

export function VocabularyScreen({
  vocabularyNotebook,
  vocabularyDecks,
  onOpen,
}: VocabularyScreenProps & {
  onOpen: (deckId: string | null, name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const groups = [
    {
      id: null as string | null,
      name: 'Chưa phân loại',
      count: vocabularyNotebook.items.filter(word => !word.deckId).length,
    },
    ...vocabularyDecks.items.map(deck => ({
      id: deck.id as string | null,
      name: deck.name,
      count: vocabularyNotebook.items.filter(word => word.deckId === deck.id)
        .length,
    })),
  ].filter(deck =>
    deck.name
      .toLocaleLowerCase('vi')
      .includes(query.trim().toLocaleLowerCase('vi')),
  );
  const busy = vocabularyDecks.saving;
  const refresh = () => {
    vocabularyNotebook.reload().catch(() => {});
    vocabularyDecks.reload().catch(() => {});
  };
  async function create() {
    try {
      const deck = await vocabularyDecks.create(name);
      setName('');
      setCreating(false);
      onOpen(deck.id, deck.name);
    } catch {
      /* The account hook displays the error. */
    }
  }
  return (
    <FlatList
      testID="vocabulary-decks"
      data={groups}
      keyExtractor={deck => deck.id ?? 'unclassified'}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={deckStyles.list}
      refreshControl={
        <RefreshControl
          refreshing={
            vocabularyDecks.loading ||
            vocabularyNotebook.loading ||
            vocabularyDecks.saving ||
            vocabularyNotebook.saving
          }
          onRefresh={refresh}
          colors={['#55ddb6']}
          tintColor="#55ddb6"
          progressBackgroundColor="#111f31"
        />
      }
      ListHeaderComponent={
        <View style={deckStyles.header}>
          <Text style={deckStyles.subtitle}>
            {vocabularyDecks.items.length + 1} bộ ·{' '}
            {vocabularyNotebook.items.length} từ đã lưu
          </Text>
          <Text style={deckStyles.hint}>
            Gom từ theo chủ đề để tìm lại và ôn tập dễ hơn.
          </Text>
          <View style={deckStyles.toolbar}>
            <TextInput
              accessibilityLabel="Tìm bộ từ vựng"
              placeholder="Tìm bộ từ vựng…"
              placeholderTextColor="#74839a"
              value={query}
              onChangeText={setQuery}
              style={[deckStyles.input, deckStyles.search]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tạo bộ từ vựng"
              disabled={busy}
              onPress={() => setCreating(value => !value)}
              style={deckStyles.createButton}
            >
              <Plus size={19} color="#07111f" />
              <Text style={deckStyles.createText}>Tạo bộ</Text>
            </Pressable>
          </View>
          {creating ? (
            <View style={deckStyles.form}>
              <Text style={deckStyles.name}>Bộ từ vựng mới</Text>
              <TextInput
                accessibilityLabel="Tên bộ từ vựng"
                placeholder="Ví dụ: Công việc, Du lịch…"
                placeholderTextColor="#74839a"
                value={name}
                onChangeText={setName}
                maxLength={80}
                style={deckStyles.input}
                autoFocus
              />
              <View style={deckStyles.toolbar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Lưu bộ từ vựng"
                  disabled={busy || !name.trim()}
                  onPress={create}
                  style={[
                    deckStyles.createButton,
                    (busy || !name.trim()) && deckStyles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color="#07111f" />
                  ) : (
                    <Text style={deckStyles.createText}>Tạo bộ</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCreating(false)}
                  style={deckStyles.textButton}
                >
                  <Text style={deckStyles.hint}>Hủy</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {vocabularyDecks.error || vocabularyNotebook.error ? (
            <View style={deckStyles.errorPanel}>
              <Text style={deckStyles.error}>
                {vocabularyDecks.error ?? vocabularyNotebook.error}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={refresh}
                style={deckStyles.textButton}
              >
                <Text style={deckStyles.subtitle}>Đồng bộ lại</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mở bộ ${item.name}`}
          onPress={() => onOpen(item.id, item.name)}
          style={({ pressed }) => [
            deckStyles.card,
            pressed && deckStyles.pressed,
          ]}
        >
          <View style={deckStyles.folder}>
            <Folder size={25} color="#55ddb6" strokeWidth={1.7} />
          </View>
          <View style={deckStyles.cardContent}>
            <Text style={deckStyles.name}>{item.name}</Text>
            <Text style={deckStyles.hint}>
              {item.count} từ{!item.id ? ' · Từ mới chờ sắp xếp' : ''}
            </Text>
          </View>
          <ChevronRight size={18} color="#74839a" />
        </Pressable>
      )}
      ListEmptyComponent={
        <Text style={deckStyles.hint}>Không tìm thấy bộ phù hợp.</Text>
      }
    />
  );
}

export function VocabularyDeckScreen({
  vocabularyNotebook,
  vocabularyDecks,
  reportWords,
  deckId,
  onBack,
}: VocabularyScreenProps & { deckId: string | null; onBack: () => void }) {
  const deck = vocabularyDecks.items.find(item => item.id === deckId);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const busy = vocabularyDecks.saving || vocabularyNotebook.saving;
  async function rename() {
    if (!deckId) return;
    try {
      await vocabularyDecks.rename(deckId, name);
      setRenaming(false);
    } catch {
      /* Show the hook error. */
    }
  }
  function remove() {
    if (!deckId) return;
    Alert.alert(
      'Xóa bộ từ vựng?',
      `Xóa bộ “${deck?.name ?? ''}”? Các từ sẽ chuyển về Chưa phân loại.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa bộ',
          style: 'destructive',
          onPress: () => {
            vocabularyDecks
              .remove(deckId)
              .then(async () => {
                try {
                  await vocabularyNotebook.reload();
                } finally {
                  onBack();
                }
              })
              .catch(() => {});
          },
        },
      ],
    );
  }
  if (
    deckId &&
    !deck &&
    !vocabularyDecks.loading &&
    !vocabularyDecks.saving &&
    !vocabularyDecks.error
  ) {
    return (
      <View style={deckStyles.list}>
        <Text style={deckStyles.name}>Bộ từ vựng này không còn tồn tại.</Text>
        <Text style={deckStyles.hint}>
          Các từ trong bộ đã chuyển về Chưa phân loại.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={deckStyles.textButton}
        >
          <Text style={deckStyles.subtitle}>Quay lại danh sách bộ</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View testID="screen-vocabulary-deck" style={deckStyles.container}>
      {deckId ? (
        <View style={deckStyles.detailToolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đổi tên bộ"
            disabled={busy}
            onPress={() => {
              setName(deck?.name ?? '');
              setRenaming(value => !value);
            }}
            style={deckStyles.textButton}
          >
            <Text style={deckStyles.subtitle}>Đổi tên bộ</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xóa bộ từ vựng"
            disabled={busy}
            onPress={remove}
            style={deckStyles.textButton}
          >
            <Text style={deckStyles.error}>Xóa bộ</Text>
          </Pressable>
        </View>
      ) : null}
      {renaming ? (
        <View style={deckStyles.renameForm}>
          <TextInput
            accessibilityLabel="Tên mới của bộ"
            value={name}
            onChangeText={setName}
            maxLength={80}
            placeholderTextColor="#74839a"
            style={deckStyles.input}
          />
          <View style={deckStyles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lưu tên bộ"
              disabled={busy || !name.trim()}
              onPress={rename}
              style={[
                deckStyles.createButton,
                (busy || !name.trim()) && deckStyles.disabled,
              ]}
            >
              <Text style={deckStyles.createText}>Lưu tên</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRenaming(false)}
              style={deckStyles.textButton}
            >
              <Text style={deckStyles.hint}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {vocabularyDecks.error ? (
        <Text style={deckStyles.detailError}>{vocabularyDecks.error}</Text>
      ) : null}
      <VocabularyNotebook
        items={vocabularyNotebook.items.filter(
          word => (word.deckId ?? null) === deckId,
        )}
        loading={vocabularyNotebook.loading}
        saving={busy}
        error={vocabularyNotebook.error}
        reportWords={reportWords}
        onSave={words => vocabularyNotebook.save(words, deckId)}
        onRemove={vocabularyNotebook.remove}
        onReload={async () => {
          await Promise.all([
            vocabularyNotebook.reload(),
            vocabularyDecks.reload(),
          ]);
        }}
        decks={vocabularyDecks.items}
        deckId={deckId}
        onMove={vocabularyNotebook.move}
      />
    </View>
  );
}

const deckStyles = StyleSheet.create({
  container: { flex: 1 },
  list: { flexGrow: 1, padding: 20, gap: 12, paddingBottom: 28 },
  header: { gap: 12, marginBottom: 6 },
  toolbar: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  subtitle: { color: '#55ddb6', fontSize: 13, fontWeight: '600' },
  hint: { color: '#8190a5', fontSize: 13, lineHeight: 20 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#233247',
    backgroundColor: '#111f31',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#f7fbff',
    fontSize: 14,
  },
  search: { flex: 1 },
  createButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    backgroundColor: '#55ddb6',
    borderRadius: 12,
  },
  createText: { color: '#07111f', fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: '#111f31',
    borderWidth: 1,
    borderColor: '#233247',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardContent: { flex: 1, gap: 5 },
  folder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#16342f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#f7fbff', fontSize: 16, fontWeight: '600' },
  form: { padding: 16, borderRadius: 16, backgroundColor: '#111f31', gap: 12 },
  textButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  errorPanel: { backgroundColor: '#2a1a1a', borderRadius: 12, padding: 12 },
  error: { color: '#ff8f8f', fontSize: 13, lineHeight: 20 },
  detailError: { color: '#ff8f8f', marginHorizontal: 20, fontSize: 13 },
  detailToolbar: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  renameForm: { paddingHorizontal: 20, paddingBottom: 10, gap: 10 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
});
