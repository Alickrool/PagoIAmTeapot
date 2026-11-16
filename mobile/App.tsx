import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './src/navigation';
import AutoPayScreen from './src/screens/AutoPayScreen';
import BillScreen from './src/screens/BillScreen';
import DisputeScreen from './src/screens/DisputeScreen';
import HomeScreen from './src/screens/HomeScreen';
import OffersScreen from './src/screens/OffersScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My bills' }} />
          <Stack.Screen name="Bill" component={BillScreen} options={{ title: 'Bill' }} />
          <Stack.Screen name="Dispute" component={DisputeScreen} options={{ title: 'Contest bill' }} />
          <Stack.Screen name="Offers" component={OffersScreen} options={{ title: 'Better offers' }} />
          <Stack.Screen name="AutoPay" component={AutoPayScreen} options={{ title: 'Smart Auto-Pay' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
