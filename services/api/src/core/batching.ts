/**
 * Two orders on one route, like Uber and DoorDash. Only orders from the same pickup whose
 * dropoffs are close together are paired, and only if the shared route is not much longer than
 * the longer solo trip — so neither customer waits much longer.
 */
import { estimateRoute, haversineMeters, Point } from './geo';
import { offerPayCents, splitBatchPay } from './rate-card';

export interface PendingDelivery { orderId: string; pickup: Point; dropoff: Point; readyAt?: Date | null }
export interface PlannedOffer {
  orderIds: string[]; distanceMeters: number; durationSeconds: number; payCents: number; payPerOrder: Record<string, number>;
}

export const BATCH_LIMITS = { maxDropoffGapMeters: 1500, maxExtraSeconds: 600, sameRestaurantOnly: true } as const;

export function planSolo(d: PendingDelivery): PlannedOffer {
  const r = estimateRoute([d.pickup, d.dropoff]);
  const pay = offerPayCents(r.distanceMeters, r.durationSeconds);
  return { orderIds: [d.orderId], ...r, payCents: pay, payPerOrder: { [d.orderId]: pay } };
}

export function planPair(a: PendingDelivery, b: PendingDelivery, limits = BATCH_LIMITS): PlannedOffer | null {
  if (haversineMeters(a.pickup, b.pickup) > 50) return null; // same pickup only
  if (haversineMeters(a.dropoff, b.dropoff) > limits.maxDropoffGapMeters) return null;
  const ab = estimateRoute([a.pickup, a.dropoff, b.dropoff]);
  const ba = estimateRoute([a.pickup, b.dropoff, a.dropoff]);
  const [route, first, second] = ab.durationSeconds <= ba.durationSeconds ? [ab, a, b] : [ba, b, a];
  const soloA = planSolo(a), soloB = planSolo(b);
  if (route.durationSeconds - Math.max(soloA.durationSeconds, soloB.durationSeconds) > limits.maxExtraSeconds) return null;
  const pay = offerPayCents(route.distanceMeters, route.durationSeconds);
  return {
    orderIds: [first.orderId, second.orderId], ...route, payCents: pay,
    payPerOrder: splitBatchPay(pay, { [soloA.orderIds[0]]: soloA.payCents, [soloB.orderIds[0]]: soloB.payCents }),
  };
}

/** Greedy pairing: oldest first, pair with the best partner if one qualifies. */
export function planOffers(pending: PendingDelivery[]): PlannedOffer[] {
  const left = [...pending];
  const out: PlannedOffer[] = [];
  while (left.length) {
    const a = left.shift()!;
    let best: { i: number; plan: PlannedOffer } | null = null;
    left.forEach((b, i) => {
      const plan = planPair(a, b);
      if (plan && (!best || plan.durationSeconds < best.plan.durationSeconds)) best = { i, plan };
    });
    if (best) { out.push((best as { plan: PlannedOffer }).plan); left.splice((best as { i: number }).i, 1); }
    else out.push(planSolo(a));
  }
  return out;
}
