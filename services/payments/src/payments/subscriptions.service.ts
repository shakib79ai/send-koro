/**
 * Restaurant (and optional driver) subscriptions — brief §"Subscription billing rules".
 *
 * One platform Billing subscription per restaurant billing entity, billed to the restaurant's
 * Accounts v2 account through `customer_account`. The first month is free: a 30-day trial from
 * sign-up, after which the restaurant renews on that day every month (BUSINESS_MODEL.md, 4 Nov 2026).
 * An hourly job finds subscriptions renewing in the next 24 hours whose base month (the calendar
 * month before the renewal) has ended, computes that month's net food sales, picks the tier price
 * and switches it with proration_behavior 'none' before the renewal invoice is created.
 * invoice.created double-checks and, if the job did not run, pauses finalisation
 * (auto_advance = false) and raises an alert.
 */
import type Stripe from 'stripe';
import { and, eq, gt, isNotNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { restaurants, subscriptions, tierSnapshots } from '../db/schema';
import { freeTrialEnd, monthBounds, previousPeriod, RESTAURANT_TIER_RULE_VERSION, RESTAURANT_TIERS, selectTier, TIER_JOB_HORIZON_MS, tierDueAt } from '../core/tiers';

/** Next renewal of a Stripe subscription: the trial end while trialing, else the item's period end. */
export function renewalOf(sub: Pick<Stripe.Subscription, 'status' | 'trial_end' | 'items'>): Date | null {
  const end = sub.status === 'trialing' && sub.trial_end ? sub.trial_end : sub.items?.data?.[0]?.current_period_end ?? sub.trial_end;
  return end ? new Date(end * 1000) : null;
}
import { LedgerService } from './ledger.service';

export class SubscriptionsService {
  private priceCache = new Map<string, string>();
  constructor(
    private readonly stripe: Stripe,
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly opts: { firstMonthFree: boolean; alert: (msg: string, data?: unknown) => void },
    private readonly now: () => Date = () => new Date(),
  ) {}

  async priceId(lookupKey: string): Promise<string> {
    const hit = this.priceCache.get(lookupKey);
    if (hit) return hit;
    const res = await this.stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (!res.data[0]) throw new Error(`Price ${lookupKey} missing — run npm run stripe:setup`);
    this.priceCache.set(lookupKey, res.data[0].id);
    return res.data[0].id;
  }

  /** Hosted page where the owner saves a card or US bank account for the subscription. */
  async paymentMethodSetupUrl(restaurantId: string, returnUrl: string) {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!r?.stripeAccountId) throw new Error('Restaurant not onboarded');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'setup', customer_account: r.stripeAccountId, currency: 'usd',
      payment_method_types: ['card', 'us_bank_account'],
      success_url: `${returnUrl}?setup=done`, cancel_url: `${returnUrl}?setup=cancelled`,
      metadata: { send_koro_restaurant_id: r.id, purpose: 'subscription_payment_method' },
    });
    return session.url!;
  }

  async ensureRestaurantSubscription(restaurantId: string) {
    const [existing] = await this.db.select().from(subscriptions).where(and(eq(subscriptions.subjectType, 'restaurant'), eq(subscriptions.subjectId, restaurantId)));
    if (existing) return existing;
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!r?.stripeAccountId) throw new Error('Restaurant not onboarded');
    const lowest = await this.priceId(RESTAURANT_TIERS[0].lookupKey);
    const sub = await this.stripe.subscriptions.create(
      {
        customer_account: r.stripeAccountId,
        items: [{ price: lowest }],
        collection_method: 'charge_automatically',
        payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card', 'us_bank_account'] },
        ...(this.opts.firstMonthFree
          ? { trial_end: Math.floor(freeTrialEnd(this.now()).getTime() / 1000), trial_settings: { end_behavior: { missing_payment_method: 'pause' } } }
          : {}),
        metadata: { send_koro_type: 'restaurant_subscription', send_koro_restaurant_id: r.id },
      },
      { idempotencyKey: `restaurant-sub:${r.id}` },
    );
    const [row] = await this.db.insert(subscriptions).values({
      subjectType: 'restaurant', subjectId: r.id, stripeSubscriptionId: sub.id, stripeItemId: sub.items.data[0].id, currentPriceId: lowest, status: sub.status,
      renewsAt: renewalOf(sub),
    }).onConflictDoNothing().returning();
    return row ?? (await this.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sub.id)))[0];
  }

  /** Keeps status and next renewal in step with Stripe (customer.subscription.updated / .deleted). */
  async onSubscriptionChanged(sub: Stripe.Subscription) {
    await this.db.update(subscriptions).set({ status: sub.status, renewsAt: renewalOf(sub) }).where(eq(subscriptions.stripeSubscriptionId, sub.id));
  }

  /**
   * Tier job. Without `period`, handles each restaurant whose renewal is due (within 24 hours, base
   * month ended). With `period` ('YYYY-MM'), a manual run for every restaurant for that month.
   * Safe to re-run: one snapshot per restaurant per period (unique index).
   */
  async runRestaurantTierJob(period?: string) {
    const now = this.now();
    const all = await this.db.select().from(subscriptions).where(and(eq(subscriptions.subjectType, 'restaurant'),
      ...(period ? [] : [isNotNull(subscriptions.renewsAt), gt(subscriptions.renewsAt, now), lte(subscriptions.renewsAt, new Date(now.getTime() + TIER_JOB_HORIZON_MS))])));
    const work = all.flatMap((s) => {
      if (period) return [{ s, period }];
      const due = tierDueAt(s.renewsAt!, now);
      return due.due ? [{ s, period: due.period }] : [];
    });
    const results: { restaurantId: string; period: string; netBaseCents: number; tier: string; changed: boolean; skipped?: string }[] = [];
    for (const { s, period } of work) {
      const { start, end } = monthBounds(period);
      const [already] = await this.db.select().from(tierSnapshots)
        .where(and(eq(tierSnapshots.subjectType, 'restaurant'), eq(tierSnapshots.subjectId, s.subjectId), eq(tierSnapshots.period, period)));
      if (already) { results.push({ restaurantId: s.subjectId, period, netBaseCents: already.netBaseCents, tier: already.priceLookupKey, changed: false, skipped: 'snapshot exists' }); continue; }
      const base = await this.ledger.foodSalesForPeriod(s.subjectId, start, end);
      const tier = selectTier(base.netBaseCents);
      const priceId = await this.priceId(tier.lookupKey);
      const changed = priceId !== s.currentPriceId;
      if (changed) {
        await this.stripe.subscriptions.update(s.stripeSubscriptionId, { items: [{ id: s.stripeItemId, price: priceId }], proration_behavior: 'none', metadata: { tier_period: period, tier_rule: RESTAURANT_TIER_RULE_VERSION } }, { idempotencyKey: `tier:${s.subjectId}:${period}` });
        await this.db.update(subscriptions).set({ currentPriceId: priceId }).where(eq(subscriptions.id, s.id));
      }
      await this.db.insert(tierSnapshots).values({
        subjectType: 'restaurant', subjectId: s.subjectId, period, ...base, ruleVersion: RESTAURANT_TIER_RULE_VERSION, priceLookupKey: tier.lookupKey, priceId,
      }).onConflictDoNothing();
      results.push({ restaurantId: s.subjectId, period, netBaseCents: base.netBaseCents, tier: tier.lookupKey, changed });
    }
    return results;
  }

  /** invoice.created safety net for renewal invoices. */
  async onInvoiceCreated(invoice: Stripe.Invoice) {
    if (invoice.billing_reason !== 'subscription_cycle') return;
    const subId = invoice.parent?.subscription_details?.subscription;
    const subscriptionId = typeof subId === 'string' ? subId : subId?.id;
    if (!subscriptionId) return;
    const [s] = await this.db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
    if (!s) return;
    const period = previousPeriod(new Date(invoice.created * 1000));
    const [snap] = await this.db.select().from(tierSnapshots)
      .where(and(eq(tierSnapshots.subjectType, s.subjectType), eq(tierSnapshots.subjectId, s.subjectId), eq(tierSnapshots.period, period)));
    const linePrice = invoice.lines.data[0]?.pricing?.price_details?.price;
    const linePriceId = typeof linePrice === 'string' ? linePrice : linePrice?.id;
    if (!snap || (linePriceId && linePriceId !== snap.priceId)) {
      await this.stripe.invoices.update(invoice.id!, { auto_advance: false });
      this.opts.alert('Renewal invoice paused: tier snapshot missing or price mismatch', { invoice: invoice.id, subjectId: s.subjectId, period });
      return;
    }
    await this.db.update(tierSnapshots).set({ invoiceId: invoice.id! }).where(eq(tierSnapshots.id, snap.id));
  }
}
