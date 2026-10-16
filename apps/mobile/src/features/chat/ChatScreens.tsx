import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { AuthResult } from '../../api/client';
import {
  chatApi,
  type ChatCharacter,
  type ChatCharacterInput,
  type ChatMessage,
  type ChatThread,
} from './chat.api';
import { chatStorage } from './chat.storage';
import { chatNotifications } from './chat.notifications';
import type { ChatSession } from './useChat';
import { chatStyles as s } from './chat.styles';

export function ChatButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
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
}
export function ChatField({
  label,
  value,
  onChange,
  numeric,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'numeric' : 'default'}
        multiline={multiline}
        placeholderTextColor="#8596ad"
        style={s.input}
      />
    </View>
  );
}
export function ChatToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.text, s.grow]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: '#287a63', false: '#365069' }}
        thumbColor={value ? '#55ddb6' : '#a9b7ca'}
      />
    </View>
  );
}
export function Avatar({
  name,
  color = '#55ddb6',
}: {
  name: string;
  color?: string;
}) {
  return (
    <View style={[s.avatar, { borderColor: color }]}>
      <Text style={s.avatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
    </View>
  );
}
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Không thực hiện được, vui lòng thử lại';

export function ChatInboxScreen({
  chat,
  onOpen,
  onPeople,
  onGroup,
}: {
  chat: ChatSession;
  onOpen: (id: string) => void;
  onPeople: () => void;
  onGroup: () => void;
}) {
  const focused = useIsFocused();
  const refreshInbox = chat.refresh;
  useEffect(() => {
    if (focused) void refreshInbox();
  }, [focused, refreshInbox]);
  return (
    <ScrollView testID="screen-messages" contentContainerStyle={s.content}>
      <Text style={s.hint}>
        Bạn bè AI ở xa · Cùng trò chuyện bằng tiếng Anh mỗi ngày
      </Text>
      <View style={s.row}>
        <View style={s.grow}>
          <ChatButton label="Thêm bạn" onPress={onPeople} />
        </View>
        <View style={s.grow}>
          <ChatButton label="Tạo nhóm" onPress={onGroup} />
        </View>
      </View>
      {chat.error ? (
        <View style={s.card}>
          <Text style={s.error}>{chat.error}</Text>
          <ChatButton
            label="Tải lại hộp thư"
            onPress={() => void chat.refresh()}
          />
        </View>
      ) : null}
      {chat.loading ? <ActivityIndicator color="#55ddb6" /> : null}
      {!chat.loading && !chat.threads.length ? (
        <View style={s.card}>
          <Text style={s.title}>Làm quen với người bạn đầu tiên</Text>
          <Text style={s.text}>
            Chọn một nhân vật hoặc tạo bạn mới với tính cách bạn thích. Bạn cũng
            có thể rủ vài người vào nhóm.
          </Text>
        </View>
      ) : null}
      {chat.threads.map(thread => (
        <Pressable
          key={thread.id}
          accessibilityRole="button"
          accessibilityLabel={`Mở chat ${thread.title}`}
          onPress={() => onOpen(thread.id)}
          style={s.card}
        >
          <View style={s.row}>
            <Avatar
              name={thread.title}
              color={thread.members[0]?.character.color}
            />
            <View style={s.grow}>
              <Text style={s.title}>{thread.title}</Text>
              <Text style={s.hint}>
                {thread.kind === 'GROUP'
                  ? `${thread.members.length} người bạn AI`
                  : thread.romance
                    ? 'Hẹn hò · Nhân vật AI'
                    : 'Bạn bè · Nhân vật AI'}
              </Text>
            </View>
            {!!thread.unread && <Text style={s.badge}>{thread.unread}</Text>}
          </View>
          <Text numberOfLines={2} style={s.text}>
            {thread.messages?.[0]?.content ?? 'Hãy gửi lời chào đầu tiên'}
          </Text>
          <Text style={s.hint}>
            {new Date(thread.updatedAt).toLocaleString('vi-VN')}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function ChatPeopleScreen({
  auth,
  chat,
  onOpen,
  onEdit,
}: {
  auth: AuthResult;
  chat: ChatSession;
  onOpen: (id: string) => void;
  onEdit: (id?: string) => void;
}) {
  const [catalog, setCatalog] = useState<ChatCharacter[]>([]);
  const [friends, setFriends] = useState<ChatCharacter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const focused = useIsFocused();
  const load = useCallback(async () => {
    try {
      const [templates, characters] = await Promise.all([
        chatApi.catalog(auth.accessToken),
        chatApi.characters(auth.accessToken),
      ]);
      setCatalog(templates);
      setFriends(characters);
      setError(undefined);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [auth.accessToken]);
  useEffect(() => {
    if (focused) void load();
  }, [focused, load]);
  async function connect(character: ChatCharacter, template: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const friend = template
        ? await chatApi.addCharacter(auth.accessToken, {
            templateId: character.id,
          })
        : character;
      const thread = await chatApi.create(auth.accessToken, {
        kind: 'DIRECT',
        title: friend.name,
        characterIds: [friend.id],
      });
      void chat.refresh();
      onOpen(thread.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const card = (character: ChatCharacter, template: boolean) => (
    <View key={`${template}:${character.id}`} style={s.card}>
      <View style={s.row}>
        <Avatar name={character.name} color={character.color} />
        <View style={s.grow}>
          <Text style={s.title}>
            {character.name}, {character.age}
          </Text>
          <Text style={s.hint}>
            {character.gender} · {character.occupation} · AI
          </Text>
        </View>
      </View>
      <Text style={s.text}>{character.personality}</Text>
      <Text style={s.hint}>{character.interests}</Text>
      <ChatButton
        label={
          template
            ? `Kết bạn với ${character.name}`
            : `Nhắn cho ${character.name}`
        }
        disabled={busy}
        onPress={() => void connect(character, template)}
      />
      {!template && (
        <ChatButton
          label={`Sửa hồ sơ ${character.name}`}
          onPress={() => onEdit(character.id)}
        />
      )}
    </View>
  );
  return (
    <ScrollView contentContainerStyle={s.content}>
      <ChatButton label="Tự tạo nhân vật" onPress={() => onEdit()} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <ChatButton label="Tải lại danh sách bạn" onPress={() => void load()} />
      {!!friends.length && <Text style={s.title}>Bạn của bạn</Text>}
      {friends.map(friend => card(friend, false))}
      <Text style={s.title}>Khám phá bạn mới</Text>
      {catalog
        .filter(c => !friends.some(f => f.templateId === c.id))
        .map(c => card(c, true))}
    </ScrollView>
  );
}

const blankCharacter: ChatCharacterInput = {
  name: '',
  age: 28,
  gender: '',
  occupation: '',
  bio: '',
  personality: '',
  interests: '',
  speakingStyle: '',
  color: '#55ddb6',
};
export function CharacterEditorScreen({
  auth,
  characterId,
  onDone,
}: {
  auth: AuthResult;
  characterId?: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState<ChatCharacterInput>(blankCharacter);
  const [age, setAge] = useState('28');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!characterId);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (characterId)
      void chatApi
        .characters(auth.accessToken)
        .then(items => {
          const item = items.find(c => c.id === characterId);
          if (!item) throw new Error('Không tìm thấy nhân vật');
          setForm(item);
          setAge(String(item.age));
          setReady(true);
        })
        .catch(e => setError(errorMessage(e)));
  }, [characterId, auth.accessToken]);
  async function save() {
    const value = { ...form, age: Number(age) };
    if (
      !Number.isInteger(value.age) ||
      value.age < 18 ||
      value.age > 100 ||
      Object.entries(value).some(
        ([key, field]) => key !== 'age' && !String(field).trim(),
      )
    ) {
      setError('Hãy điền đầy đủ hồ sơ; tuổi từ 18 đến 100.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (characterId)
        await chatApi.editCharacter(auth.accessToken, characterId, value);
      else await chatApi.addCharacter(auth.accessToken, value);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.hint}>
        Nhân vật AI hư cấu · Hồ sơ này chỉ thuộc tài khoản của bạn
      </Text>
      <ChatField
        label="Tên nhân vật"
        value={form.name}
        onChange={name => setForm({ ...form, name })}
      />
      <ChatField label="Tuổi" value={age} onChange={setAge} numeric />
      {(
        [
          ['gender', 'Giới tính'],
          ['occupation', 'Nghề nghiệp'],
          ['bio', 'Giới thiệu và cuộc sống'],
          ['personality', 'Tính cách'],
          ['interests', 'Sở thích'],
          ['speakingStyle', 'Phong cách nhắn tin'],
        ] as const
      ).map(([key, label]) => (
        <ChatField
          key={key}
          label={label}
          value={form[key]}
          multiline
          onChange={value => setForm({ ...form, [key]: value })}
        />
      ))}
      <View style={s.row}>
        {['#55ddb6', '#80b9ff', '#f6adcf', '#ffd28a', '#c9acff'].map(color => (
          <Pressable
            key={color}
            accessibilityLabel={`Màu ${color}`}
            onPress={() => setForm({ ...form, color })}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: color,
              borderWidth: 3,
              borderColor: form.color === color ? 'white' : color,
            }}
          />
        ))}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <ChatButton
        label={busy ? 'Đang lưu nhân vật…' : 'Lưu nhân vật'}
        disabled={busy || !ready}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}

export function ChatThreadScreen({
  auth,
  threadId,
  chat,
  onSettings,
}: {
  auth: AuthResult;
  threadId: string;
  chat: ChatSession;
  onSettings: () => void;
}) {
  const [thread, setThread] = useState<ChatThread>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string>();
  const [reply, setReply] = useState('IDLE');
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const focused = useIsFocused();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const polling = useRef(false);
  const olderLoading = useRef(false);
  const initial = useRef(true);
  const atBottom = useRef(true);
  const alive = useRef(true);
  const visible = useRef(false);
  const sequence = useRef(0);
  const refreshInbox = chat.refresh;
  const refresh = useCallback(async () => {
    if (polling.current || !alive.current) return;
    polling.current = true;
    try {
      const page = await chatApi.messages(
        auth.accessToken,
        threadId,
        sequence.current ? `?after=${sequence.current}` : '',
      );
      if (!alive.current) return;
      setThread(page.thread);
      setReply(page.replyStatus);
      setError(page.replyError ?? undefined);
      const firstPage = initial.current;
      if (firstPage) {
        setHasMore(page.hasMore);
        initial.current = false;
      }
      if (page.items.length) {
        sequence.current = page.items[page.items.length - 1].sequence;
        setMessages(current =>
          firstPage ? page.items : mergeMessages(current, page.items),
        );
      }
      if (
        visible.current &&
        AppState.currentState === 'active' &&
        atBottom.current &&
        page.thread.lastReadSequence < sequence.current
      ) {
        await chatApi.read(auth.accessToken, threadId, sequence.current);
        void refreshInbox();
      }
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      polling.current = false;
    }
  }, [auth.accessToken, threadId, refreshInbox]);
  useEffect(() => {
    alive.current = true;
    void chatStorage
      .messages(auth.user.id, threadId)
      .then(items => {
        if (alive.current && initial.current) setMessages(items);
      })
      .catch(() => {});
    void chatStorage
      .draft(auth.user.id, threadId)
      .then(value => {
        if (alive.current) setDraft(value);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [auth.user.id, threadId]);
  useEffect(() => {
    if (messages.length)
      void chatStorage
        .cacheMessages(auth.user.id, threadId, messages)
        .catch(() => {});
  }, [auth.user.id, threadId, messages]);
  useEffect(() => {
    if (!focused) return;
    visible.current = true;
    chatNotifications.setVisibleThread(threadId);
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 3000);
    const state = AppState.addEventListener('change', value => {
      chatNotifications.setVisibleThread(value === 'active' ? threadId : null);
      if (value === 'active') void refresh();
    });
    return () => {
      visible.current = false;
      clearInterval(timer);
      state.remove();
      chatNotifications.setVisibleThread(null);
    };
  }, [focused, threadId, refresh]);
  async function older() {
    if (!messages.length || olderLoading.current) return;
    olderLoading.current = true;
    try {
      const page = await chatApi.messages(
        auth.accessToken,
        threadId,
        `?before=${messages[0].sequence}`,
      );
      setMessages(current => mergeMessages(page.items, current));
      setHasMore(page.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      olderLoading.current = false;
    }
  }
  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await chat.send(threadId, draft.trim());
      setDraft('');
      setError(undefined);
      atBottom.current = true;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }
  async function help(
    action: 'translate' | 'explain' | 'suggest',
    messageId?: string,
  ) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await chatApi.help(
        auth.accessToken,
        threadId,
        action,
        messageId,
      );
      if (action === 'suggest') {
        setDraft(result.text);
        await chatStorage.saveDraft(auth.user.id, threadId, result.text);
      } else
        Alert.alert(
          action === 'translate'
            ? 'Bản dịch tiếng Việt'
            : 'Giải thích cách diễn đạt',
          result.text,
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const pending = chat.pending.filter(
    item =>
      item.threadId === threadId &&
      !messages.some(
        message => message.clientMessageId === item.clientMessageId,
      ),
  );
  return (
    <KeyboardAvoidingView style={s.container} behavior="height">
      <View style={[s.row, { padding: 12 }]}>
        <View style={s.grow}>
          <Text style={s.title}>{thread?.title ?? 'Tin nhắn'}</Text>
          <Text style={s.hint}>
            {thread?.kind === 'GROUP'
              ? 'Nhóm bạn AI'
              : thread?.romance
                ? 'Hẹn hò · Nhân vật AI'
                : 'Bạn bè · Nhân vật AI'}
          </Text>
        </View>
        <ChatButton label="Tùy chọn chat" onPress={onSettings} />
      </View>
      <ScrollView
        ref={scroll}
        style={s.grow}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={150}
        onScroll={event => {
          const { contentOffset, layoutMeasurement, contentSize } =
            event.nativeEvent;
          atBottom.current =
            contentOffset.y + layoutMeasurement.height >=
            contentSize.height - 80;
        }}
        onContentSizeChange={() => {
          if (atBottom.current) scroll.current?.scrollToEnd({ animated: true });
        }}
      >
        {hasMore && (
          <ChatButton
            label="Xem tin cũ hơn"
            onPress={() => {
              atBottom.current = false;
              void older();
            }}
          />
        )}
        {!messages.length && (
          <Text style={s.hint}>
            Gửi lời chào để bắt đầu câu chuyện của hai bạn.
          </Text>
        )}
        {messages.map(message => {
          const character = thread?.members.find(
            member => member.characterId === message.characterId,
          )?.character;
          return (
            <View
              key={message.id}
              style={[s.bubble, message.role === 'USER' && s.ownBubble]}
            >
              {message.role === 'CHARACTER' && (
                <Text
                  style={[s.label, { color: character?.color ?? '#55ddb6' }]}
                >
                  {character?.name ?? 'Bạn AI'}
                </Text>
              )}
              <Text selectable style={s.text}>
                {message.content}
              </Text>
              <Text style={s.hint}>
                {new Date(message.createdAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {message.role === 'USER' ? ' · Đã gửi' : ''}
              </Text>
              {message.role === 'CHARACTER' && (
                <View style={s.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void help('translate', message.id)}
                  >
                    <Text style={s.label}>Dịch</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void help('explain', message.id)}
                  >
                    <Text style={s.label}>Giải thích</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        {pending.map(message => (
          <View key={message.clientMessageId} style={[s.bubble, s.ownBubble]}>
            <Text style={s.text}>{message.content}</Text>
            <Text style={s.hint}>
              {message.failed
                ? 'Chưa gửi được · Sẽ thử lại khi có kết nối'
                : 'Đang gửi…'}
            </Text>
            {message.failed && (
              <ChatButton
                label="Thử gửi lại"
                onPress={() => void chat.refresh().then(refresh)}
              />
            )}
          </View>
        ))}
        {(reply === 'PENDING' || reply === 'RUNNING') && (
          <Text accessibilityLiveRegion="polite" style={s.hint}>
            Bạn AI đang soạn tin…
          </Text>
        )}
        {error && <Text style={s.error}>{error}</Text>}
        {reply === 'FAILED' && (
          <ChatButton
            label="Thử lấy trả lời lại"
            onPress={() => {
              void chatApi
                .retry(auth.accessToken, threadId)
                .then(refresh)
                .catch(e => setError(errorMessage(e)));
            }}
          />
        )}
      </ScrollView>
      <View style={s.composer}>
        <ChatButton
          label={busy ? 'Đang chuẩn bị trợ giúp…' : 'Gợi ý trả lời'}
          disabled={busy}
          onPress={() => void help('suggest')}
        />
        <View style={s.row}>
          <TextInput
            accessibilityLabel="Soạn tin nhắn"
            placeholder="Nhắn gì đó bằng tiếng Anh…"
            placeholderTextColor="#8596ad"
            style={[s.input, s.grow, { maxHeight: 130 }]}
            multiline
            maxLength={4000}
            value={draft}
            onChangeText={value => {
              setDraft(value);
              void chatStorage
                .saveDraft(auth.user.id, threadId, value)
                .catch(() => {});
            }}
          />
          <ChatButton
            label="Gửi"
            disabled={sending || !draft.trim()}
            onPress={() => void send()}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
export function mergeMessages(
  previous: ChatMessage[],
  incoming: ChatMessage[],
) {
  const items = new Map(previous.map(message => [message.id, message]));
  incoming.forEach(message => items.set(message.id, message));
  return [...items.values()].sort((a, b) => a.sequence - b.sequence);
}
