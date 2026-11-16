import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList, TabParamList } from './src/navigation';
import AutoPayScreen from './src/screens/AutoPayScreen';
import BillScreen from './src/screens/BillScreen';
import DisputeScreen from './src/screens/DisputeScreen';
import OffersScreen from './src/screens/OffersScreen';
import OverviewScreen from './src/screens/OverviewScreen';
import ProviderScreen from './src/screens/ProviderScreen';
import ProvidersScreen from './src/screens/ProvidersScreen';
import ScanScreen from './src/screens/ScanScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
  };

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarLabelStyle: { fontWeight: '600' } }}>
      <Tab.Screen name="Overview" component={OverviewScreen} options={{ title: 'My bills', tabBarLabel: 'Overview', tabBarIcon: icon('🍩') }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan a bill', tabBarLabel: 'Scan', tabBarIcon: icon('📷') }} />
      <Tab.Screen name="Providers" component={ProvidersScreen} options={{ title: 'Providers', tabBarIcon: icon('🏢') }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="Bill" component={BillScreen} options={{ title: 'Bill' }} />
          <Stack.Screen name="Provider" component={ProviderScreen} options={{ title: 'Provider' }} />
          <Stack.Screen name="Dispute" component={DisputeScreen} options={{ title: 'Contest bill' }} />
          <Stack.Screen name="Offers" component={OffersScreen} options={{ title: 'Better offers' }} />
          <Stack.Screen name="AutoPay" component={AutoPayScreen} options={{ title: 'Smart Auto-Pay' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
