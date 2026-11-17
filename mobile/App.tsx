import { createMaterialTopTabNavigator, type MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { DarkTheme, DefaultTheme, getFocusedRouteNameFromRoute, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './src/components/Icon';
import { ModeSwitcher } from './src/components/ModeSwitcher';
import { SearchBar } from './src/components/SearchBar';
import { ModeProvider, useCopy, useMode, useTheme } from './src/mode';
import type { RootStackParamList, TabParamList } from './src/navigation';
import AddProviderScreen from './src/screens/AddProviderScreen';
import AutoPayScreen from './src/screens/AutoPayScreen';
import BillScreen from './src/screens/BillScreen';
import DisputeScreen from './src/screens/DisputeScreen';
import ModePickerScreen from './src/screens/ModePickerScreen';
import OffersScreen from './src/screens/OffersScreen';
import OverviewScreen from './src/screens/OverviewScreen';
import ProviderScreen from './src/screens/ProviderScreen';
import ProvidersScreen from './src/screens/ProvidersScreen';
import ScanScreen from './src/screens/ScanScreen';
import SearchScreen from './src/screens/SearchScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createMaterialTopTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, IconName> = { Overview: 'home', Scan: 'scan', Providers: 'providers' };

/** Large bottom tab bar (the pager above it also switches tabs by swiping left/right). */
function BigTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const t = useTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const labels: Record<keyof TabParamList, string> = { Overview: copy.tabOverview, Scan: copy.tabScan, Providers: copy.tabProviders };
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 8), paddingTop: 8, paddingHorizontal: 8, gap: 8 }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const name = route.name as keyof TabParamList;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={labels[name]}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: t.mode === 'senior' ? 72 : 60,
              borderRadius: t.inner + 6,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              backgroundColor: focused ? t.accent : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name={ICONS[name]} size={t.mode === 'senior' ? 30 : 26} color={focused ? t.onAccent : t.text} />
            <Text style={{ fontSize: t.fs(13), fontWeight: '800', color: focused ? t.onAccent : t.text }}>{labels[name]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Tabs() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SearchBar />
      <Tab.Navigator
        tabBarPosition="bottom"
        tabBar={(props) => <BigTabBar {...props} />}
        screenOptions={{ swipeEnabled: true, lazy: true, sceneStyle: { backgroundColor: t.bg } }}
      >
        <Tab.Screen name="Overview" component={OverviewScreen} />
        <Tab.Screen name="Scan" component={ScanScreen} />
        {/* no tab swipe here: swiping a provider to the right archives it */}
        <Tab.Screen name="Providers" component={ProvidersScreen} options={{ swipeEnabled: false }} />
      </Tab.Navigator>
    </View>
  );
}

function Root() {
  const { mode, ready } = useMode();
  const t = useTheme();
  const copy = useCopy();

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
        <Stack.Screen
          name="Tabs"
          component={Tabs}
          options={({ route }) => {
            const tab = (getFocusedRouteNameFromRoute(route) ?? 'Overview') as keyof TabParamList;
            return { title: tab === 'Overview' ? copy.overviewTitle : tab === 'Scan' ? copy.tabScan : copy.tabProviders };
          }}
        />
        <Stack.Screen name="Bill" component={BillScreen} options={{ title: 'Factura' }} />
        <Stack.Screen name="Provider" component={ProviderScreen} options={{ title: 'Furnizor' }} />
        <Stack.Screen name="AddProvider" component={AddProviderScreen} options={{ title: 'Adaugă furnizor' }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: 'Caută', headerRight: undefined }} />
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
