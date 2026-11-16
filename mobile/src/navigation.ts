import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  Bill: { id: number };
  Dispute: { billId: number; anomalyId?: string };
  Offers: { billId: number };
  AutoPay: { billId: number; provider: string; suggestedMax: number };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
