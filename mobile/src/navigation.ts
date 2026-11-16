import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Overview: undefined;
  Scan: undefined;
  Providers: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Bill: { id: number };
  Dispute: { billId: number; anomalyId?: string };
  Offers: { billId: number };
  AutoPay: { billId: number; provider: string; suggestedMax: number };
  Provider: { slug: string; provider: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

/** Stack navigation from anywhere, including tab screens. */
export const useStackNavigation = () => useNavigation<NativeStackNavigationProp<RootStackParamList>>();
