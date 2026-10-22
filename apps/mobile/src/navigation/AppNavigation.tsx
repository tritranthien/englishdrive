import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
} from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
  useFocusEffect,
  usePreventRemove,
  useNavigationContainerRef,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import BookOpen from 'lucide-react-native/icons/book-open';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Settings from 'lucide-react-native/icons/settings';
import MessagesSquare from 'lucide-react-native/icons/messages-square';
import Video from 'lucide-react-native/icons/video';
import { useChat, type ChatSession } from '../features/chat/useChat';
import { chatApi } from '../features/chat/chat.api';
import { chatNotifications } from '../features/chat/chat.notifications';
import {
  ChatInboxScreen,
  ChatPeopleScreen,
  ChatThreadScreen,
  CharacterEditorScreen,
} from '../features/chat/ChatScreens';
import {
  ChatPreferencesScreen,
  ChatThreadSettingsScreen,
} from '../features/chat/ChatSettingsScreens';
import {
  VideoHomeScreen,
  VideoPlayerScreen,
} from '../features/video/VideoScreens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConversationScreen } from '../screens/ConversationScreen';
import {
  VocabularyScreen,
  VocabularyDeckScreen,
  type VocabularyScreenProps,
} from '../screens/VocabularyScreen';
import {
  AssistantSettingsScreen,
  ConversationModeScreen,
  SettingsScreen,
  VoiceSettingsScreen,
  type SettingsProps,
} from '../screens/SettingsScreen';

type Tabs = {
  Conversation: undefined;
  Messages: NavigatorScreenParams<MessageRoutes> | undefined;
  Video: NavigatorScreenParams<VideoRoutes> | undefined;
  Vocabulary: undefined;
  Settings: undefined;
};
type MessageRoutes = {
  MessagesHome: undefined;
  ChatPeople: undefined;
  CharacterEditor: { characterId?: string };
  ChatThread: { threadId: string };
  GroupEditor: undefined;
  ChatOptions: { threadId: string };
};
type VideoRoutes = {
  VideoHome: undefined;
  VideoPlayer: { videoId: string; title?: string };
};
type ConversationRoutes = { ConversationHome: undefined };
type VocabularyRoutes = {
  VocabularyHome: undefined;
  VocabularyDeck: { deckId: string | null; name: string };
};
type SettingsRoutes = {
  SettingsHome: undefined;
  VoiceSettings: undefined;
  AssistantSettings: undefined;
  ConversationMode: undefined;
  ChatPreferences: undefined;
};

type Props = {
  conversation: React.ComponentProps<typeof ConversationScreen>;
  vocabulary: VocabularyScreenProps;
  settings: Omit<SettingsProps, 'onOpen'>;
  refreshAssistantStatus: () => Promise<void>;
};

const SessionContext = createContext<(Props & { chat: ChatSession }) | null>(
  null,
);
const Tab = createBottomTabNavigator<Tabs>();
const ConversationStack = createNativeStackNavigator<ConversationRoutes>();
const VocabularyStack = createNativeStackNavigator<VocabularyRoutes>();
const SettingsStack = createNativeStackNavigator<SettingsRoutes>();
const MessagesStack = createNativeStackNavigator<MessageRoutes>();
const VideoStack = createNativeStackNavigator<VideoRoutes>();
type TabIconProps = { color: string; size: number };
const tabIcons = {
  Messages: ({ color, size }: TabIconProps) => (
    <MessagesSquare color={color} size={size} strokeWidth={1.8} />
  ),
  Video: ({ color, size }: TabIconProps) => (
    <Video color={color} size={size} strokeWidth={1.8} />
  ),
  Conversation: ({ color, size }: TabIconProps) => (
    <MessageCircle color={color} size={size} strokeWidth={1.8} />
  ),
  Vocabulary: ({ color, size }: TabIconProps) => (
    <BookOpen color={color} size={size} strokeWidth={1.8} />
  ),
  Settings: ({ color, size }: TabIconProps) => (
    <Settings color={color} size={size} strokeWidth={1.8} />
  ),
};
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#55ddb6',
    background: '#07111f',
    card: '#0b1727',
    text: '#f7fbff',
    border: '#233247',
  },
};

function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Navigation requires a signed-in session');
  return session;
}

function HeaderAccount() {
  const { settings } = useSession();
  return (
    <View style={navigationStyles.account}>
      <Text numberOfLines={1} style={navigationStyles.accountName}>
        {settings.user.name}
      </Text>
      <View style={navigationStyles.avatar} accessible={false}>
        <Text style={navigationStyles.avatarText}>
          {settings.user.name.trim().slice(0, 1).toLocaleUpperCase('vi')}
        </Text>
      </View>
    </View>
  );
}

const stackOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: '#07111f' },
  headerTintColor: '#f7fbff',
  headerTitleStyle: { fontSize: 20, fontWeight: '700' },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#07111f' },
  animation: 'slide_from_right',
  statusBarStyle: 'light',
};

function ConversationContent() {
  const { conversation } = useSession();
  return <ConversationScreen {...conversation} />;
}

function VocabularyContent({
  navigation,
}: NativeStackScreenProps<VocabularyRoutes, 'VocabularyHome'>) {
  const { vocabulary } = useSession();
  const reload = vocabulary.vocabularyNotebook.reload;
  const reloadDecks = vocabulary.vocabularyDecks.reload;
  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
      reloadDecks().catch(() => {});
    }, [reload, reloadDecks]),
  );
  return (
    <VocabularyScreen
      {...vocabulary}
      onOpen={(deckId, name) =>
        navigation.navigate('VocabularyDeck', { deckId, name })
      }
    />
  );
}

function VocabularyDeckContent({
  navigation,
  route,
}: NativeStackScreenProps<VocabularyRoutes, 'VocabularyDeck'>) {
  const { vocabulary } = useSession();
  const reload = vocabulary.vocabularyNotebook.reload;
  const reloadDecks = vocabulary.vocabularyDecks.reload;
  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
      reloadDecks().catch(() => {});
    }, [reload, reloadDecks]),
  );
  return (
    <VocabularyDeckScreen
      {...vocabulary}
      deckId={route.params.deckId}
      onBack={() => navigation.goBack()}
    />
  );
}

function SettingsContent({
  navigation,
}: NativeStackScreenProps<SettingsRoutes, 'SettingsHome'>) {
  const { settings, refreshAssistantStatus } = useSession();
  const refresh = settings.speakerVerification.refresh;
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
      refreshAssistantStatus().catch(() => {});
    }, [refresh, refreshAssistantStatus]),
  );
  return (
    <SettingsScreen
      {...settings}
      onOpen={screen => navigation.navigate(screen)}
    />
  );
}

function VoiceContent() {
  const { settings, conversation } = useSession();
  usePreventRemove(conversation.isEnrolling, () => {});
  return <VoiceSettingsScreen {...settings} onOpen={() => {}} />;
}

function AssistantContent() {
  const { settings } = useSession();
  return <AssistantSettingsScreen {...settings} onOpen={() => {}} />;
}

function ModeContent() {
  const { settings } = useSession();
  return <ConversationModeScreen {...settings} onOpen={() => {}} />;
}

function MessagesHome({
  navigation,
}: NativeStackScreenProps<MessageRoutes, 'MessagesHome'>) {
  const { chat } = useSession();
  return (
    <ChatInboxScreen
      chat={chat}
      onOpen={threadId => navigation.navigate('ChatThread', { threadId })}
      onPeople={() => navigation.navigate('ChatPeople')}
      onGroup={() => navigation.navigate('GroupEditor')}
    />
  );
}
function PeopleContent({
  navigation,
}: NativeStackScreenProps<MessageRoutes, 'ChatPeople'>) {
  const { chat, conversation } = useSession();
  return (
    <ChatPeopleScreen
      auth={conversation.auth}
      chat={chat}
      onOpen={threadId => navigation.navigate('ChatThread', { threadId })}
      onEdit={characterId =>
        navigation.navigate('CharacterEditor', { characterId })
      }
    />
  );
}
function CharacterContent({
  navigation,
  route,
}: NativeStackScreenProps<MessageRoutes, 'CharacterEditor'>) {
  const { conversation } = useSession();
  return (
    <CharacterEditorScreen
      auth={conversation.auth}
      characterId={route.params.characterId}
      onDone={() => navigation.goBack()}
    />
  );
}
function ThreadContent({
  navigation,
  route,
}: NativeStackScreenProps<MessageRoutes, 'ChatThread'>) {
  const { chat, conversation } = useSession();
  return (
    <ChatThreadScreen
      key={route.params.threadId}
      auth={conversation.auth}
      chat={chat}
      threadId={route.params.threadId}
      onBack={() => navigation.popTo('MessagesHome')}
      onSaveVocabulary={conversation.vocabularyNotebook.save}
      onSettings={() => navigation.navigate('ChatOptions', route.params)}
    />
  );
}
function GroupContent({
  navigation,
}: NativeStackScreenProps<MessageRoutes, 'GroupEditor'>) {
  const { chat, conversation } = useSession();
  return (
    <ChatThreadSettingsScreen
      auth={conversation.auth}
      chat={chat}
      onDone={threadId => navigation.replace('ChatThread', { threadId })}
      onEditCharacter={characterId =>
        navigation.navigate('CharacterEditor', { characterId })
      }
    />
  );
}
function ChatOptionsContent({
  navigation,
  route,
}: NativeStackScreenProps<MessageRoutes, 'ChatOptions'>) {
  const { chat, conversation } = useSession();
  return (
    <ChatThreadSettingsScreen
      auth={conversation.auth}
      chat={chat}
      threadId={route.params.threadId}
      onDone={() => navigation.goBack()}
      onEditCharacter={characterId =>
        navigation.navigate('CharacterEditor', { characterId })
      }
    />
  );
}
function ChatPreferencesContent() {
  const { conversation } = useSession();
  return <ChatPreferencesScreen auth={conversation.auth} />;
}
function MessagesNavigator() {
  return (
    <MessagesStack.Navigator
      initialRouteName="MessagesHome"
      screenOptions={stackOptions}
    >
      <MessagesStack.Screen
        name="MessagesHome"
        component={MessagesHome}
        options={{ title: 'Tin nhắn' }}
      />
      <MessagesStack.Screen
        name="ChatPeople"
        component={PeopleContent}
        options={{ title: 'Bạn bè AI' }}
      />
      <MessagesStack.Screen
        name="CharacterEditor"
        component={CharacterContent}
        options={{ title: 'Hồ sơ nhân vật' }}
      />
      <MessagesStack.Screen
        name="ChatThread"
        component={ThreadContent}
        options={{ title: 'Trò chuyện' }}
      />
      <MessagesStack.Screen
        name="GroupEditor"
        component={GroupContent}
        options={{ title: 'Tạo nhóm bạn' }}
      />
      <MessagesStack.Screen
        name="ChatOptions"
        component={ChatOptionsContent}
        options={{ title: 'Tùy chọn chat' }}
      />
    </MessagesStack.Navigator>
  );
}

function VideoHomeContent({
  navigation,
}: NativeStackScreenProps<VideoRoutes, 'VideoHome'>) {
  const { conversation } = useSession();
  return (
    <VideoHomeScreen
      auth={conversation.auth}
      onOpenVideo={(videoId, title) =>
        navigation.navigate('VideoPlayer', { videoId, title })
      }
    />
  );
}

function VideoPlayerContent({
  route,
  navigation,
}: NativeStackScreenProps<VideoRoutes, 'VideoPlayer'>) {
  const { conversation } = useSession();
  const insets = useSafeAreaInsets();
  const onFullscreenChange = useCallback(
    (fullscreen: boolean) => {
      navigation.setOptions({ headerShown: !fullscreen });
      navigation.getParent()?.setOptions({
        tabBarStyle: fullscreen
          ? { display: 'none' }
          : mainTabBarStyle(insets.bottom),
      });
    },
    [navigation, insets.bottom],
  );
  return (
    <VideoPlayerScreen
      key={route.params.videoId}
      auth={conversation.auth}
      videoId={route.params.videoId}
      onSaveVocabulary={conversation.vocabularyNotebook.save}
      onFullscreenChange={onFullscreenChange}
    />
  );
}

function VideoNavigator() {
  return (
    <VideoStack.Navigator
      initialRouteName="VideoHome"
      screenOptions={stackOptions}
    >
      <VideoStack.Screen
        name="VideoHome"
        component={VideoHomeContent}
        options={{ title: 'Video song ngữ' }}
      />
      <VideoStack.Screen
        name="VideoPlayer"
        component={VideoPlayerContent}
        options={({ route }) => ({
          title: route.params.title || 'Xem video & phụ đề',
        })}
      />
    </VideoStack.Navigator>
  );
}

function ConversationNavigator() {
  return (
    <ConversationStack.Navigator screenOptions={stackOptions}>
      <ConversationStack.Screen
        name="ConversationHome"
        component={ConversationContent}
        options={{ title: 'EnglishDrive', headerRight: HeaderAccount }}
      />
    </ConversationStack.Navigator>
  );
}

function VocabularyNavigator() {
  const { vocabulary } = useSession();
  return (
    <VocabularyStack.Navigator screenOptions={stackOptions}>
      <VocabularyStack.Screen
        name="VocabularyHome"
        component={VocabularyContent}
        options={{ title: 'Từ vựng' }}
      />
      <VocabularyStack.Screen
        name="VocabularyDeck"
        component={VocabularyDeckContent}
        options={({ route }) => ({
          title: route.params.deckId
            ? (vocabulary.vocabularyDecks.items.find(
                deck => deck.id === route.params.deckId,
              )?.name ?? route.params.name)
            : 'Chưa phân loại',
        })}
      />
    </VocabularyStack.Navigator>
  );
}

function SettingsNavigator() {
  const { conversation } = useSession();
  return (
    <SettingsStack.Navigator screenOptions={stackOptions}>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsContent}
        options={{ title: 'Cài đặt' }}
      />
      <SettingsStack.Screen
        name="VoiceSettings"
        component={VoiceContent}
        options={{
          title: 'Bộ lọc giọng nói',
          gestureEnabled: !conversation.isEnrolling,
          headerBackVisible: !conversation.isEnrolling,
        }}
      />
      <SettingsStack.Screen
        name="AssistantSettings"
        component={AssistantContent}
        options={{ title: 'Hey English Drive' }}
      />
      <SettingsStack.Screen
        name="ConversationMode"
        component={ModeContent}
        options={{ title: 'Chế độ hội thoại' }}
      />
      <SettingsStack.Screen
        name="ChatPreferences"
        component={ChatPreferencesContent}
        options={{ title: 'Bạn bè & tin nhắn' }}
      />
    </SettingsStack.Navigator>
  );
}

export function AppNavigation(props: Props) {
  const insets = useSafeAreaInsets();
  const chat = useChat(props.conversation.auth);
  const refreshChat = chat.refresh;
  const navigation = useNavigationContainerRef<Tabs>();
  const { id: userId } = props.conversation.auth.user;
  const token = props.conversation.auth.accessToken;
  const enrolling = props.conversation.isEnrolling;
  const openNotification = useCallback(async () => {
    if (!navigation.isReady() || enrolling) return;
    const threadId = await chatNotifications.consumeOpen(userId);
    if (!threadId) return;
    try {
      await chatApi.thread(token, threadId);
      navigation.navigate('Messages', {
        screen: 'ChatThread',
        params: { threadId },
      });
    } catch {
      /* Never open another account's conversation. The inbox remains available. */
    }
  }, [navigation, userId, token, enrolling]);
  useEffect(() => {
    const update = () => {
      void chatNotifications.register(userId, token).catch(() => {});
      void openNotification();
      void refreshChat();
    };
    update();
    const subscription = chatNotifications.subscribe(update);
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') update();
    });
    return () => {
      subscription.remove();
      state.remove();
    };
  }, [userId, token, openNotification, refreshChat]);
  return (
    <SessionContext.Provider value={{ ...props, chat }}>
      <NavigationContainer
        theme={theme}
        ref={navigation}
        onReady={() => {
          void openNotification();
        }}
      >
        <Tab.Navigator
          initialRouteName="Conversation"
          backBehavior="initialRoute"
          screenListeners={{
            tabPress: event => {
              if (props.conversation.isEnrolling) event.preventDefault();
            },
          }}
          screenOptions={({ route }) => ({
            headerShown: false,
            freezeOnBlur: false,
            tabBarHideOnKeyboard: true,
            tabBarActiveTintColor: '#55ddb6',
            tabBarInactiveTintColor: '#8190a5',
            tabBarLabelStyle: navigationStyles.tabLabel,
            tabBarItemStyle: {
              opacity: props.conversation.isEnrolling ? 0.4 : 1,
            },
            tabBarStyle: mainTabBarStyle(insets.bottom),
            tabBarIcon: tabIcons[route.name],
          })}
        >
          <Tab.Screen
            name="Conversation"
            component={ConversationNavigator}
            options={{
              title: 'Hội thoại',
              tabBarAccessibilityLabel: 'Hội thoại',
            }}
          />
          <Tab.Screen
            name="Messages"
            component={MessagesNavigator}
            options={{
              title: 'Tin nhắn',
              tabBarAccessibilityLabel: 'Tin nhắn',
              tabBarBadge: chat.unread || undefined,
            }}
          />
          <Tab.Screen
            name="Video"
            component={VideoNavigator}
            options={{
              title: 'Video',
              tabBarAccessibilityLabel: 'Video',
            }}
          />
          <Tab.Screen
            name="Vocabulary"
            component={VocabularyNavigator}
            options={{ title: 'Từ vựng', tabBarAccessibilityLabel: 'Từ vựng' }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsNavigator}
            options={{ title: 'Cài đặt', tabBarAccessibilityLabel: 'Cài đặt' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SessionContext.Provider>
  );
}

function mainTabBarStyle(bottom: number) {
  return {
    backgroundColor: '#0b1727',
    borderTopColor: '#233247',
    height: 64 + bottom,
    paddingTop: 6,
    paddingBottom: bottom + 6,
    elevation: 0,
  };
}

const navigationStyles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountName: { color: '#a9b7ca', fontSize: 13, maxWidth: 100 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#183c36',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#55ddb6', fontSize: 14, fontWeight: '700' },
  tabLabel: { fontSize: 11, fontWeight: '600', marginTop: 3 },
});
