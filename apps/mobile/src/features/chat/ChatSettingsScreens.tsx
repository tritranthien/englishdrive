import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { AuthResult } from '../../api/client';
import {
  chatApi,
  type ChatCharacter,
  type ChatPreferences,
  type ChatThread,
} from './chat.api';
import { chatNotifications, type PushState } from './chat.notifications';
import { ChatButton, ChatField, ChatToggle, Avatar } from './ChatScreens';
import type { ChatSession } from './useChat';
import { chatStyles as s } from './chat.styles';

const messageFor = (e: unknown) =>
  e instanceof Error ? e.message : 'Chưa lưu được cài đặt';
function intervalValues(min: string, max: string) {
  const a = Number(min),
    b = Number(max);
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 5 ||
    b < a ||
    b > 10080
  )
    throw new Error(
      'Khoảng cách phải từ 5 đến 10080 phút; tối đa không nhỏ hơn tối thiểu.',
    );
  return { minMinutes: a, maxMinutes: b };
}

export function ChatPreferencesScreen({ auth }: { auth: AuthResult }) {
  const [prefs, setPrefs] = useState<ChatPreferences>();
  const [values, setValues] = useState({
    min: '',
    max: '',
    daily: '',
    start: '',
    end: '',
    timezone: '',
  });
  const [push, setPush] = useState<PushState>();
  const [status, setStatus] = useState<{
    pushConfigured: boolean;
    proactiveEnabled: boolean;
  }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [settings, service] = await Promise.all([
        chatApi.preferences(auth.accessToken),
        chatApi.status(auth.accessToken),
      ]);
      setPrefs(settings);
      setStatus(service);
      setValues({
        min: String(settings.minMinutes),
        max: String(settings.maxMinutes),
        daily: String(settings.dailyLimit),
        start: String(settings.quietStart),
        end: String(settings.quietEnd),
        timezone: settings.timezone,
      });
      setError(undefined);
      const device = await chatNotifications.register(
        auth.user.id,
        auth.accessToken,
      );
      setPush(device);
    } catch (e) {
      setError(messageFor(e));
    }
  }
  useEffect(() => {
    void load();
  }, [auth.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!prefs) return;
    setBusy(true);
    setNotice(undefined);
    setError(undefined);
    try {
      const interval = intervalValues(values.min, values.max);
      const dailyLimit = Number(values.daily),
        quietStart = Number(values.start),
        quietEnd = Number(values.end);
      if (
        !Number.isInteger(dailyLimit) ||
        dailyLimit < 1 ||
        dailyLimit > 50 ||
        ![quietStart, quietEnd].every(
          hour => Number.isInteger(hour) && hour >= 0 && hour <= 23,
        )
      )
        throw new Error('Giới hạn ngày từ 1–50 đợt, giờ yên lặng từ 0–23.');
      try {
        new Intl.DateTimeFormat('en', { timeZone: values.timezone });
      } catch {
        throw new Error('Múi giờ không hợp lệ, ví dụ Asia/Ho_Chi_Minh.');
      }
      setPrefs(
        await chatApi.savePreferences(auth.accessToken, {
          ...prefs,
          ...interval,
          dailyLimit,
          quietStart,
          quietEnd,
          timezone: values.timezone,
        }),
      );
      setNotice('Đã lưu lịch nhắn tin. Lịch mới áp dụng từ bây giờ.');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }
  async function enablePush() {
    setBusy(true);
    try {
      setPush(
        await chatNotifications.register(auth.user.id, auth.accessToken, true),
      );
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.title}>Bạn bè & tin nhắn</Text>
      <Text style={s.text}>
        Bạn bè AI có thể chủ động mở chuyện. Mỗi nhóm trao đổi 2–4 tin rồi dừng,
        để bạn tham gia khi thuận tiện.
      </Text>
      {error && <Text style={s.error}>{error}</Text>}
      {notice && (
        <Text accessibilityLiveRegion="polite" style={s.label}>
          {notice}
        </Text>
      )}
      {!prefs ? (
        <ChatButton label="Tải cài đặt tin nhắn" onPress={() => void load()} />
      ) : (
        <>
          <View style={s.card}>
            <ChatToggle
              label="Cho phép bạn bè chủ động nhắn"
              value={prefs.enabled}
              onChange={enabled => setPrefs({ ...prefs, enabled })}
            />
            <ChatField
              label="Khoảng cách tối thiểu (phút)"
              numeric
              value={values.min}
              onChange={min => setValues({ ...values, min })}
            />
            <ChatField
              label="Khoảng cách tối đa (phút)"
              numeric
              value={values.max}
              onChange={max => setValues({ ...values, max })}
            />
            <ChatField
              label="Tối đa số đợt chủ động mỗi ngày"
              numeric
              value={values.daily}
              onChange={daily => setValues({ ...values, daily })}
            />
            <Text style={s.hint}>
              Giới hạn ngày tính chung mọi bạn và nhóm. Sau hai đợt chưa đọc,
              cuộc chat tạm ngừng chủ động.
            </Text>
          </View>
          <View style={s.card}>
            <Text style={s.title}>Giờ yên lặng</Text>
            <ChatField
              label="Từ giờ (0–23)"
              numeric
              value={values.start}
              onChange={start => setValues({ ...values, start })}
            />
            <ChatField
              label="Đến giờ (0–23)"
              numeric
              value={values.end}
              onChange={end => setValues({ ...values, end })}
            />
            <Text style={s.hint}>
              Hai giờ bằng nhau là không dùng giờ yên lặng. Bạn vẫn có thể tự
              nhắn và nhận trả lời bất cứ lúc nào.
            </Text>
            <ChatField
              label="Múi giờ"
              value={values.timezone}
              onChange={timezone => setValues({ ...values, timezone })}
            />
            <ChatButton
              label="Dùng múi giờ điện thoại"
              onPress={() =>
                setValues({
                  ...values,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              }
            />
          </View>
          <ChatButton
            label={busy ? 'Đang lưu…' : 'Lưu lịch nhắn tin'}
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
      <View style={s.card}>
        <Text style={s.title}>Thông báo trên điện thoại</Text>
        <Text style={s.text}>
          {!status?.pushConfigured || !push?.configured
            ? 'Thông báo khi đóng ứng dụng chưa khả dụng. Tin nhắn vẫn xuất hiện trong hộp thư khi mở ứng dụng.'
            : push.permissionGranted
              ? 'Đã bật thông báo tin nhắn.'
              : 'Thông báo đang tắt. Bạn vẫn có thể đọc tin trong hộp thư.'}
        </Text>
        {!status?.proactiveEnabled && (
          <Text style={s.error}>
            Lịch nhắn chủ động chưa được bật. Bạn vẫn có thể nhắn và nhận trả
            lời.
          </Text>
        )}
        <ChatButton
          label="Cho phép thông báo tin nhắn"
          disabled={busy}
          onPress={() => void enablePush()}
        />
        <ChatButton
          label="Mở cài đặt thông báo Android"
          onPress={() => void Linking.openSettings()}
        />
      </View>
    </ScrollView>
  );
}

export function ChatThreadSettingsScreen({
  auth,
  threadId,
  chat,
  onDone,
  onEditCharacter,
}: {
  auth: AuthResult;
  threadId?: string;
  chat: ChatSession;
  onDone: (id: string) => void;
  onEditCharacter: (id: string) => void;
}) {
  const [thread, setThread] = useState<ChatThread>();
  const [friends, setFriends] = useState<ChatCharacter[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [min, setMin] = useState('120');
  const [max, setMax] = useState('360');
  const [custom, setCustom] = useState(false);
  const [romance, setRomance] = useState(false);
  const [proactive, setProactive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.all([
      chatApi.characters(auth.accessToken),
      threadId
        ? chatApi.thread(auth.accessToken, threadId)
        : Promise.resolve(undefined),
    ])
      .then(([people, current]) => {
        setFriends(people);
        setThread(current);
        setReady(true);
        if (current) {
          setSelected(current.members.map(m => m.characterId));
          setTitle(current.title);
          setRomance(current.romance);
          setProactive(current.proactiveEnabled);
          setMuted(current.muted);
          setCustom(current.minMinutes != null);
          setMin(String(current.minMinutes ?? 120));
          setMax(String(current.maxMinutes ?? 360));
        }
      })
      .catch(e => setError(messageFor(e)));
  }, [auth.accessToken, threadId]);
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      if (!title.trim()) throw new Error('Hãy nhập tên cuộc trò chuyện.');
      const group = !threadId || thread?.kind === 'GROUP';
      if (group && (selected.length < 2 || selected.length > 6))
        throw new Error('Nhóm cần từ 2 đến 6 người bạn AI.');
      const interval = custom
        ? intervalValues(min, max)
        : { minMinutes: null, maxMinutes: null };
      const result = threadId
        ? await chatApi.update(auth.accessToken, threadId, {
            title: title.trim(),
            romance: group ? false : romance,
            proactiveEnabled: proactive,
            muted,
            ...interval,
            ...(group ? { characterIds: selected } : {}),
          })
        : await chatApi.create(auth.accessToken, {
            kind: 'GROUP',
            title: title.trim(),
            characterIds: selected,
          });
      if (!threadId && (custom || !proactive || muted))
        await chatApi.update(auth.accessToken, result.id, {
          proactiveEnabled: proactive,
          muted,
          ...interval,
        });
      void chat.refresh();
      onDone(result.id);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {!ready && !error && <ActivityIndicator color="#55ddb6" />}
      <ChatField
        label={thread?.kind === 'DIRECT' ? 'Tên cuộc trò chuyện' : 'Tên nhóm'}
        value={title}
        onChange={setTitle}
      />
      {(!threadId || thread?.kind === 'GROUP') && (
        <View style={s.card}>
          <Text style={s.title}>Chọn 2–6 người bạn</Text>
          <Text style={s.hint}>
            Thêm bạn trong mục Khám phá trước khi mời vào nhóm.
          </Text>
          {friends.map(person => (
            <View key={person.id} style={s.row}>
              <Avatar name={person.name} color={person.color} />
              <View style={s.grow}>
                <ChatToggle
                  label={`${person.name} · ${person.occupation}`}
                  value={selected.includes(person.id)}
                  onChange={checked =>
                    setSelected(current =>
                      checked
                        ? [...current, person.id]
                        : current.filter(id => id !== person.id),
                    )
                  }
                />
              </View>
            </View>
          ))}
        </View>
      )}
      {thread?.kind === 'DIRECT' && (
        <View style={s.card}>
          <ChatToggle
            label="Chế độ hẹn hò"
            value={romance}
            onChange={setRomance}
          />
          <Text style={s.hint}>
            Tắt để giữ quan hệ bạn bè. Mỗi nhân vật là người trưởng thành hư
            cấu.
          </Text>
          <ChatButton
            label="Sửa hồ sơ nhân vật"
            onPress={() => onEditCharacter(thread.members[0].characterId)}
          />
        </View>
      )}
      <View style={s.card}>
        <ChatToggle
          label="Chủ động mở chuyện"
          value={proactive}
          onChange={setProactive}
        />
        <ChatToggle
          label="Tắt thông báo cuộc chat này"
          value={muted}
          onChange={setMuted}
        />
        <ChatToggle
          label="Dùng khoảng cách riêng"
          value={custom}
          onChange={setCustom}
        />
        {custom ? (
          <>
            <ChatField
              label="Tối thiểu (phút)"
              value={min}
              onChange={setMin}
              numeric
            />
            <ChatField
              label="Tối đa (phút)"
              value={max}
              onChange={setMax}
              numeric
            />
          </>
        ) : (
          <Text style={s.hint}>
            Dùng khoảng cách trong Cài đặt → Bạn bè & tin nhắn.
          </Text>
        )}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <ChatButton
        label={
          busy ? 'Đang lưu…' : threadId ? 'Lưu tùy chọn chat' : 'Tạo nhóm bạn'
        }
        disabled={busy || !ready}
        onPress={() => void save()}
      />
    </ScrollView>
  );
}
