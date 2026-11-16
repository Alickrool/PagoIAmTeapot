// Suggested questions for ONE bill: built from its category (water/gas/electricity/telecom), its provider and
// the problems the audit found on it, so a water bill asks about water, an Engie bill about gas, and so on.
import type { BillDetail } from './api/types';
import type { Mode } from './mode';

const BY_CATEGORY: Record<BillDetail['category'], (p: string) => string[]> = {
  electricity: (p) => [`De ce e TVA-ul atât de mare la ${p}?`, 'Ce înseamnă contribuția de cogenerare?', `Cum calculează ${p} prețul pe kWh?`],
  gas: (p) => ['Ce e plafonarea prețului la gaz?', `Cum transformă ${p} metrii cubi în kWh?`, 'De ce e factura de gaz mai mare iarna?'],
  water: (p) => [`Ce plătesc la ${p} pe lângă apă?`, `Cât costă un metru cub de apă la ${p}?`, 'De ce mi-a crescut consumul de apă?'],
  telecom: (p) => [`Ce opțiuni am în abonamentul ${p}?`, 'Pot renunța la o opțiune plătită?', `De ce plătesc la ${p} mai mult decât la început?`],
  other: () => ['De ce a crescut factura?', 'Ce taxe sunt pe această factură?'],
};

function fromAnomalies(bill: BillDetail): string[] {
  const p = bill.provider;
  return bill.audit.anomalies.flatMap((a) => {
    if (a.id === 'estimated_index') return [`Ce fac dacă ${p} mi-a estimat indexul?`];
    if (a.id === 'price_spike') return [`De ce a crescut factura ${p} față de luna trecută?`];
    if (a.id.startsWith('extra_service')) return [`Ce opțiuni plătite am pe factura ${p} și cum renunț?`];
    if (a.id === 'above_market') return [`Există o ofertă mai ieftină decât ${p}?`];
    if (a.id === 'penalty') return ['De ce am penalități pe factură?'];
    return [];
  });
}

export function questionsFor(bill: BillDetail, mode: Mode): string[] {
  const all = [...fromAnomalies(bill), ...(BY_CATEGORY[bill.category] ?? BY_CATEGORY.other)(bill.provider)];
  const unique = [...new Set(all)];
  return unique.slice(0, mode === 'senior' ? 2 : 4);
}
