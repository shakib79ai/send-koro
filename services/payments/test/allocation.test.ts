/** Brief §"Payment allocation" table, invoice example and invariants. */
import { describe, expect, it } from 'vitest';
import { AllocationError, applicationFeeAfterShare, computeAllocation, customerBreakdown, deliveryFeeShare, DeliveryConsent, estimateStripeFee, validateAllocation } from '../src/core/allocation';

const c = (rule: DeliveryConsent['rule'], cap?: number): DeliveryConsent => ({ rule, perOrderCapCents: cap, version: 1 });
const base = { foodCents: 3000, serviceChargeCents: 0, restaurantTaxCents: 0, tipCents: 0, deliveryCents: 1000 };
const fee = { bps: 290, fixedCents: 30 };

describe('brief allocation table (F=$30, D=$10, S=X=T=0)', () => {
  it.each([
    ['Customer pays all', c({ kind: 'customer_pays' }), 1000, 0, 4000, 3000],
    ['Restaurant pays all', c({ kind: 'restaurant_pays' }), 0, 1000, 3000, 2000],
    ['Equal partnership', c({ kind: 'split_percent', restaurantBps: 5000 }), 500, 500, 3500, 2500],
    ['Restaurant pays 30%', c({ kind: 'split_percent', restaurantBps: 3000 }), 700, 300, 3700, 2700],
  ])('%s', (_n, consent, C, R, Q, net) => {
    const a = computeAllocation({ ...base, consent });
    expect([a.C, a.R, a.Q, a.restaurantRetained]).toEqual([C, R, Q, net]);
    expect(a.A).toBe(1000); // Send Koro always receives the $10 delivery allocation — not a food commission
  });
});

describe('brief complete invoice example', () => {
  it('F $30 + S $2 + X $2.40 + C $5 + T $4 = $43.40; Send Koro $14; restaurant $29.40', () => {
    const a = computeAllocation({ foodCents: 3000, serviceChargeCents: 200, restaurantTaxCents: 240, tipCents: 400, deliveryCents: 1000, consent: c({ kind: 'split_fixed', restaurantCents: 500 }) });
    expect(a.Q).toBe(4340);
    expect(a.A).toBe(1400);
    expect(a.restaurantRetained).toBe(2940);
    expect(a.A + a.restaurantRetained).toBe(a.Q);
  });
  it('worked shared-delivery example: charge $39, application fee $14, restaurant keeps $25', () => {
    const a = computeAllocation({ ...base, tipCents: 400, consent: c({ kind: 'split_fixed', restaurantCents: 500 }) });
    expect([a.Q, a.A, a.restaurantRetained]).toEqual([3900, 1400, 2500]);
  });
});

describe('rules, caps and rounding', () => {
  it('percent rounding is deterministic: restaurant share floored, remainder to customer', () => {
    const a = computeAllocation({ ...base, deliveryCents: 999, consent: c({ kind: 'split_percent', restaurantBps: 3333 }) });
    expect(a.R).toBe(332); // floor(999 × 0.3333 = 332.97)
    expect(a.C).toBe(667);
  });
  it('free above an amount: free at/over the minimum, optional fixed help below it', () => {
    const rule = { kind: 'free_above' as const, minFoodCents: 3000, belowRestaurantCents: 300 };
    expect(computeAllocation({ ...base, consent: c(rule) }).R).toBe(1000);
    expect(computeAllocation({ ...base, foodCents: 2999, consent: c(rule) }).R).toBe(300);
  });
  it('per-order cap: customer pays the excess when the courier quote spikes', () => {
    const a = computeAllocation({ ...base, deliveryCents: 1140, consent: c({ kind: 'restaurant_pays' }, 1000) });
    expect([a.R, a.C]).toEqual([1000, 140]);
  });
  it('fixed split never exceeds D', () => {
    const a = computeAllocation({ ...base, deliveryCents: 400, consent: c({ kind: 'split_fixed', restaurantCents: 500 }) });
    expect([a.R, a.C]).toEqual([400, 0]);
  });
  it('pickup: no delivery, no tip allocation', () => {
    const a = computeAllocation({ ...base, deliveryCents: 0, consent: c({ kind: 'restaurant_pays' }) });
    expect([a.D, a.R, a.C, a.A, a.Q]).toEqual([0, 0, 0, 0, 3000]);
  });
  it('invariants hold across many random inputs', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
    for (let i = 0; i < 2000; i++) {
      const consent = [c({ kind: 'customer_pays' }), c({ kind: 'restaurant_pays' }), c({ kind: 'split_percent', restaurantBps: rnd(10001) }), c({ kind: 'split_fixed', restaurantCents: rnd(2000) }), c({ kind: 'free_above', minFoodCents: rnd(5000), belowRestaurantCents: rnd(800) }, rnd(3) ? undefined : rnd(1500))][rnd(5)];
      const a = computeAllocation({ foodCents: rnd(20000), serviceChargeCents: rnd(500), restaurantTaxCents: rnd(1800), tipCents: rnd(1200), deliveryCents: rnd(2500), consent });
      expect(a.C + a.R).toBe(a.D);
      expect(a.R).toBeGreaterThanOrEqual(0);
      expect(a.R).toBeLessThanOrEqual(a.D);
      expect(a.Q - a.A).toBe(a.restaurantRetained);
      expect(a.A).toBe(a.D + a.T); // tip always passes in full
    }
  });
  it('rejects fractional or negative cents', () => {
    expect(() => computeAllocation({ ...base, foodCents: 10.5, consent: c({ kind: 'customer_pays' }) })).toThrow(AllocationError);
    expect(() => computeAllocation({ ...base, tipCents: -1, consent: c({ kind: 'customer_pays' }) })).toThrow(AllocationError);
  });
});

describe('validation', () => {
  it('rejects when the restaurant subsidy is larger than the order itself', () => {
    const a = computeAllocation({ foodCents: 900, serviceChargeCents: 0, restaurantTaxCents: 0, tipCents: 0, deliveryCents: 1000, consent: c({ kind: 'restaurant_pays' }) });
    expect(() => validateAllocation(a, fee)).toThrow(expect.objectContaining({ code: 'insufficient_restaurant_proceeds' }));
  });
  it('rejects when proceeds cover the subsidy but not the Stripe fee on the whole charge', () => {
    const a = computeAllocation({ foodCents: 1000, serviceChargeCents: 0, restaurantTaxCents: 0, tipCents: 0, deliveryCents: 1000, consent: c({ kind: 'restaurant_pays' }) });
    expect(() => validateAllocation(a, fee)).toThrow(/cannot cover/);
  });
  it('accepts a normal free-delivery order', () => {
    const a = computeAllocation({ ...base, consent: c({ kind: 'restaurant_pays' }) });
    expect(() => validateAllocation(a, fee)).not.toThrow();
    expect(estimateStripeFee(a.Q, fee)).toBe(117);
  });
  it('customer breakdown never names the delivery provider', () => {
    const a = computeAllocation({ ...base, tipCents: 400, restaurantTaxCents: 266, consent: c({ kind: 'restaurant_pays' }) });
    const b = customerBreakdown(a, 'Dhaka Kitchen');
    const text = JSON.stringify(b);
    expect(text).not.toMatch(/uber|doordash|dasher/i);
    expect(b.lines.map((l) => l.label)).toContain('Free delivery from Dhaka Kitchen');
    expect(b.totalCents).toBe(3000 + 266 + 400);
  });
});

describe('delivery money bears its share of the processing fee', () => {
  const a = computeAllocation({ ...base, tipCents: 400, consent: c({ kind: 'split_fixed', restaurantCents: 500 }) }); // Q 3900, C 500, T 400
  it('share = fee × (C + T) / Q; application fee lowered by exactly that share', () => {
    const fee = estimateStripeFee(a.Q, { bps: 290, fixedCents: 30 });
    expect(fee).toBe(144);
    expect(deliveryFeeShare(a, fee)).toBe(33);
    expect(applicationFeeAfterShare(a, fee)).toBe(1400 - 33);
  });
  it('restaurant-paid delivery: R is food money, so only the tip carries a delivery fee share', () => {
    const free = computeAllocation({ ...base, tipCents: 400, consent: c({ kind: 'restaurant_pays' }) }); // C 0, Q 3400
    expect(deliveryFeeShare(free, estimateStripeFee(free.Q, { bps: 290, fixedCents: 30 }))).toBe(Math.round(129 * 400 / 3400));
  });
  it('no delivery, no share; international cards cost more', () => {
    const pickup = computeAllocation({ ...base, deliveryCents: 0, consent: c({ kind: 'customer_pays' }) });
    expect(deliveryFeeShare(pickup, 117)).toBe(0);
    expect(estimateStripeFee(3900, { bps: 290, fixedCents: 30 }, 'GB')).toBe(202);
    expect(estimateStripeFee(3900, { bps: 290, fixedCents: 30 }, 'US')).toBe(144);
  });
  it('restaurant keeps the same amount it would if delivery cost it no fees', () => {
    const fee = 144;
    const restaurantNet = a.Q - fee - applicationFeeAfterShare(a, fee); // what lands on the restaurant account
    const foodOnlyFee = fee - deliveryFeeShare(a, fee);
    expect(restaurantNet).toBe(a.restaurantRetained - foodOnlyFee);
  });
});
