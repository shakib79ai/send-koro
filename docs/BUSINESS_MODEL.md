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

  - The first month is free.
  - Zero or negative months pay the lowest plan.
  - **Each location has its own plan**, from that location's own net food sales (5 Nov 2026; replaces "one plan covers all locations"). All locations are billed together on one invoice, one line each.
  - A new location's first month is free; locations that aren't live yet aren't billed (5 Nov 2026, proposed in the prototype; confirm).
  - **Each location may use its own connected Stripe account** or the account's main one (5 Nov 2026). Direct charges for a location's orders go to that location's account.
  - Billed on the 1st at 12:00 ET, with no proration.
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

- **Customers see each location separately** (5 Nov 2026), nearest first, with address search (no distance shown or filtered; 6 Nov 2026). A location delivers only inside its own delivery radius; outside it the customer can order pickup.
- **Delivery areas and availability** (5 Nov 2026, designed in the prototypes; backend to follow):
  - **Admin, service areas:** areas Send Koro operates in (e.g. Brooklyn, Queens, Manhattan), each with a longest-delivery limit (default 5 mi), open/closed, and a bad-weather pause that turns delivery off for the whole area (pickup stays open). If no courier is available, the location shows pickup only.
  - **Restaurant, per location:** delivery on/off and pickup on/off; delivery area as up to 3 distance rings (each with its own minimum order and extra minutes) or a list of ZIP codes, never beyond the area limit; delivery hours = opening hours or stop N minutes before closing; pause delivery only (30 min, 1 hour, rest of today).
  - **Customer:** no distances are shown anywhere (6 Nov 2026), because they confuse people. The delivery area is set by the restaurant within the admin limit. When a customer opens a location that can't deliver to their address (outside its area, delivery paused, or no courier), the Delivery button is switched off and only Pickup can be chosen; their delivery choice comes back on other restaurants. Listings say "Delivers to you", "Pickup only for your address", "Delivery paused right now" or "Closed · opens …", with the restaurant's minimum order where one applies. The delivery fee still follows distance behind the scenes (courier quote + markup). Checkout blocks delivery below the minimum and offers pickup.
  - No small-order fee and no Send Koro busy-time surcharge; minimums are the restaurant's choice.

- **Providers:**
  - Uber Direct: primary.
  - DoorDash Drive: backup, pending approval.
  - Send Koro's own drivers.
- **Courier price (P)** = the Uber Direct quote (about $7.80 average), including for own drivers.
- **Delivery markup (5 Nov 2026):** the delivery price **D = P + payout cost + card-fee cost**, the smallest amount at which Send Koro breaks even on the delivery money after Stripe's card fee and the cost of paying the courier. The customer sees one "Delivery fee" line, the same for every payment method; there is never a separate card fee. **The markup and the courier's own price are never shown to customers or restaurants** (receipts, restaurant portal, invoices); they appear only in the admin console, where the markup is configured. Restaurant delivery rules (split, free over, pays all) apply to D.
  - Payout cost per delivery: 0.25% of (P + tip) + 25¢ for both own drivers and third-party couriers (5 Nov 2026). For Uber Direct and DoorDash the money is paid out to Send Koro's bank and then settled to the provider. Both are settings and need Stripe's or the provider's written fee schedule.
  - Example, $30 food, $2.66 tax, $5.40 tip, restaurant pays $3: own driver or third party, P $7.80 → **D $8.48** (payout 29¢ + card 39¢). In both, the application fee after the card share equals P + tip (+ payout cost), so drivers and couriers still get their full pay and 100% of the tip.
- **Third-party couriers** are paid by their invoice, not through Stripe Connect. The full tip is sent through their tip field (DoorDash requires 100% pass-through).

## Own drivers

- **Connected Stripe accounts set up like restaurants** (3 Nov 2026): full Dashboard; Stripe collects fees and covers losses; recipient configuration for weekly transfers. Needs Stripe's written confirmation.
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
| Losses | Stripe (`losses_collector = stripe`) |
| Fees | Stripe collects from the connected account (`fees_collector = stripe`) |
| Restaurant Dashboard | Full Stripe Dashboard |
| Onboarding | Stripe-hosted, Accounts v2 |
| Billing | Pay-as-you-go (0.7% of subscription volume) until restaurant subscriptions exceed about $88k/month |
| Stripe Tax | Off for orders (restaurants handle tax) |
| Payment methods | Cards, Apple Pay, Google Pay, Link; domain `sendkoro.com` |

Platform account from the brief: `acct_1UVa9IQzpvBKCndf`. Support contact info@shlglobal.biz, +1 917-624-8233. Website https://sendkoro.com.

## Open decisions

- Whether to add the delivery fee share to the delivery price (recommended).
- Refund policy when a cancelled order's driver or supplier has already been paid.
- Stripe's written answers to the brief's review questions; see `services/payments/README.md`.
