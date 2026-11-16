import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ModeSwitcher } from './src/components/ModeSwitcher';
import { ModeProvider, useCopy, useMode, useTheme } from './src/mode';
import type { RootStackParamList, TabParamList } from './src/navigation';
import AutoPayScreen from './src/screens/AutoPayScreen';
import BillScreen from './src/screens/BillScreen';
import DisputeScreen from './src/screens/DisputeScreen';
import ModePickerScreen from './src/screens/ModePickerScreen';
import OffersScreen from './src/screens/OffersScreen';
import OverviewScreen from './src/screens/OverviewScreen';
import ProviderScreen from './src/screens/ProviderScreen';
import ProvidersScreen from './src/screens/ProvidersScreen';
import ScanScreen from './src/screens/ScanScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

function Tabs() {
  const t = useTheme();
  const copy = useCopy();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border, height: t.mode === 'senior' ? 76 : undefined },
        tabBarLabelStyle: { fontWeight: '700', fontSize: t.fs(11) },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: t.fs(18), fontWeight: '800' },
        headerRight: ModeSwitcher,
      }}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} options={{ title: copy.overviewTitle, tabBarLabel: copy.tabOverview, tabBarIcon: icon('🍩') }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ title: copy.tabScan, tabBarLabel: copy.tabScan, tabBarIcon: icon('📷') }} />
      <Tab.Screen name="Providers" component={ProvidersScreen} options={{ title: copy.tabProviders, tabBarLabel: copy.tabProviders, tabBarIcon: icon('🏢') }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { mode, ready } = useMode();
  const t = useTheme();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!mode) return <ModePickerScreen />;

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: { ...base.colors, primary: t.accent, background: t.bg, card: t.bg, text: t.text, border: t.border },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontSize: t.fs(18), fontWeight: '800' },
          headerRight: ModeSwitcher,
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false, title: 'Acasă' }} />
        <Stack.Screen name="Bill" component={BillScreen} options={{ title: 'Factura' }} />
        <Stack.Screen name="Provider" component={ProviderScreen} options={{ title: 'Furnizor' }} />
        <Stack.Screen name="Dispute" component={DisputeScreen} options={{ title: 'Contestă factura' }} />
        <Stack.Screen name="Offers" component={OffersScreen} options={{ title: 'Oferte mai bune' }} />
        <Stack.Screen name="AutoPay" component={AutoPayScreen} options={{ title: 'Plată automată' }} />
      </Stack.Navigator>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ModeProvider>
        <Root />
      </ModeProvider>
    </SafeAreaProvider>
  );
}
