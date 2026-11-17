import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import type { OffersResponse } from '../api/types';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation';
import { useStyles, useTheme, type Theme } from '../mode';
import { money } from '../theme';

export default function OffersScreen({ route }: ScreenProps<'Offers'>) {
  const t = useTheme();
  const styles = useStyles(makeStyles);
  const [data, setData] = useState<OffersResponse | null>(null);

  useEffect(() => {
    api.offers(route.params.billId).then(setData);
  }, [route.params.billId]);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} style={{ backgroundColor: t.bg }}>
      <Text style={styles.intro}>
        Acum plătești {data.current_all_in_price} lei/{data.unit}, cu tot cu taxe. La același consum, factura ar fi fost:
      </Text>
      {data.offers.length === 0 && <Text style={{ color: t.text }}>Nu am găsit oferte mai ieftine.</Text>}
      {data.offers.map((o) => (
        <View key={o.supplier} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.supplier}>{o.supplier}</Text>
            <Text style={styles.muted}>
              {o.offer} · {o.all_in_price} lei/{data.unit}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.price}>{money(o.estimated_total)}</Text>
            <Text style={styles.savings}>−{money(o.savings)}</Text>
          </View>
        </View>
      ))}
      {data.offers.length > 0 && (
        <Button title="Schimbă furnizorul din AI Pago" onPress={() => Alert.alert('Schimbă furnizorul', 'Demo: aici începe înscrierea la partener.')} />
      )}
      <Text style={styles.muted}>{data.disclaimer}</Text>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
  intro: { color: t.text, lineHeight: 20 },
  card: { flexDirection: 'row', backgroundColor: t.surface, borderRadius: 14, padding: 16 },
  supplier: { fontWeight: '700', fontSize: 16, color: t.text },
  muted: { color: t.muted, fontSize: 13 },
  price: { fontWeight: '700', color: t.text },
  savings: { color: t.sev.ok.color, fontWeight: '700' },
});
