import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { OffersResponse } from '../api/types';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { colors, money } from '../theme';

export default function OffersScreen({ route }: ScreenProps<'Offers'>) {
  const [data, setData] = useState<OffersResponse | null>(null);

  useEffect(() => {
    api.offers(route.params.billId).then(setData);
  }, [route.params.billId]);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: colors.bg }}>
      <Text style={styles.intro}>
        You pay {data.current_all_in_price} RON/{data.unit} all-in. With the same consumption, this bill would have been:
      </Text>
      {data.offers.length === 0 && <Text>No cheaper offers found.</Text>}
      {data.offers.map((o) => (
        <View key={o.supplier} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.supplier}>{o.supplier}</Text>
            <Text style={styles.muted}>
              {o.offer} · {o.all_in_price} RON/{data.unit}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.price}>{money(o.estimated_total)}</Text>
            <Text style={styles.savings}>−{money(o.savings)}</Text>
          </View>
        </View>
      ))}
      {data.offers.length > 0 && (
        <Button title="Switch in Pago" onPress={() => Alert.alert('Switch supplier', 'Demo: partner sign-up flow.')} />
      )}
      <Text style={styles.muted}>{data.disclaimer}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.text, lineHeight: 20 },
  card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 16 },
  supplier: { fontWeight: '700', fontSize: 16, color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  price: { fontWeight: '700', color: colors.text },
  savings: { color: '#15803D', fontWeight: '700' },
});
