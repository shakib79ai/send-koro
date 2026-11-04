# Send Koro — business model and decisions

This is the source of truth for product and money rules. Where it differs from `STRIPE_TECHNICAL_BRIEF.md` (v1.2), **this document wins**. Each rule notes when it was decided.

## Platform

- Food-ordering marketplace launching in **New York City**, with US expansion to follow.
- **Apps:**
  - Customer: Web, PWA, iOS, Android, with identical features on all four.
  - Restaurant: Web and PWA (phone, tablet and installed desktop app), with identical features.
  - Driver: separate iOS and Android Flutter apps.
  - Admin console.
- **Design system "Saffron & Ink":**
  - Fonts: Sora (headings) and Inter (text).
  - Colours: orange `#FF7A00`, ink `#0E0F12`, paper `#F7F7F5`.
  - Screen designs: `DESIGNS.md`.

## Restaurants

- **$0 commission on food.** Restaurants keep their food sales minus card processing and any delivery subsidy they choose.
- **Monthly plan from the previous calendar month's net food sales** (food after discounts, minus food refunds; New York time). Tips, tax, delivery and service charges are excluded.

  | Food sales last month | Plan |
  |---|---|
  | up to $2,500 | $50 |
  | $2,500.01 – $5,000 | $100 |
  | $5,000.01 – $7,500 | $150 |
  | $7,500.01 – $10,000 | $250 |
  | $10,000.01 – $15,000 | $350 |
  | over $15,000 | $500 |

  - The first month is free: **exactly 30 days from sign-up** (4 Nov 2026).
  - After the free month, each restaurant is billed every month on its own renewal day (the day the trial ended), with no proration. Example: joins 4 Nov → free until 4 Dec → first bill 4 Dec, based on November's sales.
  - The plan is locked in the 24 hours before each renewal, once the previous calendar month has ended in New York time.
  - Zero or negative months pay the lowest plan.
  - One plan covers all of an account's locations.
  - Late refunds count in the month they're processed.
- **Card processing** (2.9% + 30¢ under Stripe standard pricing) is paid by the restaurant on the food part of each order. **Customers are never charged a card processing fee** (3 Nov 2026).
- **Sales tax is the restaurant's responsibility** (3 Nov 2026):
  - The restaurant sets its rate. A rate is suggested from its address.
  - The restaurant must accept "I'm responsible for charging, reporting and paying sales tax" before taking orders.
  - The tax goes to the restaurant with the food payment.
  - **Send Koro never collects, files or pays sales tax.**
  - Launch is **blocked** in any state whose marketplace-facilitator law would force the platform to collect on restaurant meals (e.g. Georgia above $100k). NY and CA are fine.
- **Service charges and extra fees** are set by the restaurant. Types: service charge, mandatory gratuity, packaging fee, large-order fee.
  - Each must be shown on the menu and in the cart before payment.
  - In NY a service charge is taxable.
  - A mandatory gratuity is untaxed only if it is listed separately, labelled "gratuity", and paid 100% to staff.
- **Order acceptance:** the card is authorised at checkout and charged only when the restaurant accepts. Unanswered orders are declined and released after 5 minutes.

## Delivery fee (who pays)

The restaurant chooses, per location or for all locations, and every choice is stored as a versioned consent:

1. Customer pays the full delivery fee.
2. Restaurant pays all (free delivery).
3. Split: the restaurant covers a fixed $ amount or a % of the fee; the customer pays the rest.
4. Free above an order amount, with optional fixed help below it.

Plus an optional **per-order cap** (the customer pays any excess) and a **monthly budget** (customers pay once it's used up). Free-delivery offers (day- or item-based) stack on top; the customer gets the better deal, and the restaurant never pays more than the fee.

The customer always sees a single line, **"Delivery fee"**, then any "Free delivery from {Restaurant}" or "{Restaurant} pays part" discount. **The courier company is never named to customers** (3 Nov 2026).

## Fulfilment

- **Providers:**
  - Uber Direct: primary.
  - DoorDash Drive: backup, pending approval.
  - Send Koro's own drivers.
- **Delivery price** = the Uber Direct quote (about $7.80 average), including for own drivers.
- **Third-party couriers** are paid by their invoice, not through Stripe Connect. The full tip is sent through their tip field (DoorDash requires 100% pass-through).

## Own drivers

- **Connected Stripe accounts with the Express Dashboard** (4 Nov 2026): recipient configuration for weekly transfers. Send Koro collects fees and covers losses (`fees_collector` and `losses_collector = application`).
  - Stripe rejected the full Dashboard and Stripe-covered fees and losses for payout-only accounts in the sandbox. This replaces the 3 Nov "set up like restaurants" decision.
  - Send Koro pays the driver accounts' Connect costs (about $2 per active driver a month plus a small per-payout fee) as a delivery cost. Drivers are never charged.
  - Loss risk is low because drivers only receive transfers.
- **No driver subscription and no fees charged to drivers** (decided 29 Oct, confirmed 3 Nov 2026).
- **Rate card:** $2.50 pickup + $0.45 per minute + $0.75 per mile. Example: 2.0 mi and 18 min = **$12.10**.
- **Two orders on one route** (batching) like Uber and DoorDash. Example: 2.8 mi and 24 min = **$15.40** for both. Each order is still paid fairly.
- **Upfront, locked pay:** before accepting, the driver sees distance, total time and pay. Pay **never goes down** for traffic or delays.
- **NYC minimum pay:** $22.13 per hour of trip time (standard method; $36.88 under the alternative method). If actual trip time pushes pay below that, the shortfall is added to the weekly payout automatically. Locked pay cannot remove this legal check. Built: every Monday 06:00 ET the API totals last week's trips and the payments service transfers any shortfall once per driver per week.
- **Tips:** 100% to the driver, never used to meet the minimum, never reduced.
- **Payouts:** weekly on Mondays to the driver's own Stripe account. Instant payouts are off at launch.

## Processing fees on delivery money (3 Nov 2026)

- The delivery money pays its own share of Stripe's processing fee: **share = fee × (customer delivery contribution + tip) ÷ order total**.
- It is settled by lowering the application fee, so restaurants don't pay processing on delivery.
- **The fee share is never taken from a driver's pay or tip.** It comes out of Send Koro's delivery margin, for own drivers and third-party couriers alike.
- **Known cost:** about 33¢ on a $39 order with a $5 customer delivery fee and a $4 tip. Single own-driver orders already pay the driver more than the $7.80 delivery price; batching roughly breaks even.
- **Recommended, not built yet:** add the fee share to the delivery price at quote time.

## Stripe configuration

| Setting | Choice |
|---|---|
| Charge type | Direct charges on the restaurant's account |
| Connect pricing | **Stripe handles pricing for your users** (no per-account fees for Send Koro on restaurant accounts) |
| Losses | Restaurants: Stripe (`losses_collector = stripe`). Drivers: Send Koro (`application`) |
| Fees | Restaurants: Stripe collects from the connected account (`fees_collector = stripe`). Drivers: Send Koro (`application`) |
| Restaurant Dashboard | Full Stripe Dashboard |
| Driver Dashboard | Express Dashboard |
| Onboarding | Stripe-hosted, Accounts v2 |
| Billing | Pay-as-you-go (0.7% of subscription volume) until restaurant subscriptions exceed about $88k/month |
| Stripe Tax | Off for orders (restaurants handle tax) |
| Payment methods | Cards, Apple Pay, Google Pay, Link; domain `sendkoro.com` |

Platform account from the brief: `acct_1UVa9IQzpvBKCndf`. Support contact info@shlglobal.biz, +1 917-624-8233. Website https://sendkoro.com.

## Open decisions

- Whether to add the delivery fee share to the delivery price (recommended).
- Refund policy when a cancelled order's driver or supplier has already been paid.
- Stripe's written answers to the brief's review questions; see `services/payments/README.md`.
