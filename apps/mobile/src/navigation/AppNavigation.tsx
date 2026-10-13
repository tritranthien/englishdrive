import React, { createContext, useCallback, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
  useFocusEffect,
  usePreventRemove,
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
  Vocabulary: undefined;
  Settings: undefined;
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
};

type Props = {
  conversation: React.ComponentProps<typeof ConversationScreen>;
  vocabulary: VocabularyScreenProps;
  settings: Omit<SettingsProps, 'onOpen'>;
  refreshAssistantStatus: () => Promise<void>;
};

const SessionContext = createContext<Props | null>(null);
const Tab = createBottomTabNavigator<Tabs>();
const ConversationStack = createNativeStackNavigator<ConversationRoutes>();
const VocabularyStack = createNativeStackNavigator<VocabularyRoutes>();
const SettingsStack = createNativeStackNavigator<SettingsRoutes>();
type TabIconProps = { color: string; size: number };
const tabIcons = {
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
    </SettingsStack.Navigator>
  );
}

export function AppNavigation(props: Props) {
  const insets = useSafeAreaInsets();
  return (
    <SessionContext.Provider value={props}>
      <NavigationContainer theme={theme}>
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
            tabBarStyle: {
              backgroundColor: '#0b1727',
              borderTopColor: '#233247',
              height: 64 + insets.bottom,
              paddingTop: 6,
              paddingBottom: insets.bottom + 6,
              elevation: 0,
            },
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
