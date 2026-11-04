# Stripe Dashboard checklist — Send Koro

Your brief says: "There is no Dashboard setting that automatically implements this whole workflow." Code handles the money logic. The steps below can only be done by a person signed in to Stripe. Do every step in a **sandbox** first. Then repeat the "Live" steps when you activate.

Platform account (from the brief): `acct_1UVa9IQzpvBKCndf`

## 0. Live account check (owner only, do now; no changes in code)

From the developer setup guide (3 Nov 2026). An earlier live API check found the items below. Check them again in the Dashboard before you change anything.

- [ ] **Legal structure.** The company name is *SHL GLOBAL CONSULTING INC*, but the structure was recorded as *sole proprietorship*. The owner confirms which is correct under **Settings → Business → Business details** before changing it. Don't use a different entity or make up verification details.
- [ ] **Payout bank account.** It's still required. The owner adds the business bank account.
- [ ] **Website verification** for https://sendkoro.com is pending. Make sure the site shows the business name, contact details, terms, privacy and refund policy.
- [ ] **Live placeholder products.** `prod_VZ22McI8fFqJ4w` (restaurant) and `prod_VZ22tdJZUnxPaP` (driver) exist in live with no prices. Don't reuse them: the setup script creates `sk_restaurant_subscription` when you run it with live keys. Archive the driver placeholder, because there is no driver subscription (see `BUSINESS_MODEL.md`).

## 1. Sandbox (do now)

- [ ] **Create a sandbox.** Dashboard → account switcher → **Sandboxes** → *Create sandbox* ("Send Koro dev"). Copy its keys from **Developers → API keys** into `.env`:
  - `STRIPE_SECRET_KEY=sk_test_…`
  - `STRIPE_PUBLISHABLE_KEY=pk_test_…`
- [ ] **Turn on Connect in the sandbox.** **Connect → Get started**. Choose "Platform or marketplace". Charge type: **Direct charges**. Fees: **Stripe handles pricing for your users**. Losses: **Stripe**. Dashboard for connected accounts: **Full Stripe Dashboard**. Onboarding: **Stripe-hosted**. These match the brief's configuration table.
- [ ] **Connect branding.** **Settings → Connect → Branding**. Add the Send Koro icon, brand colour `#FF7A00`, business name and support URL. Restaurants see this on hosted onboarding.
- [ ] **Accounts v2.** Check that **Connect → Settings** shows the new Accounts experience (Accounts v2) as available for this sandbox. If not, ask Stripe support to enable it (see review question 1).
- [ ] **Run the setup script.** It creates the products, tier prices, webhooks, Accounts v2 event destination, customer portal and, optionally, test accounts:
  ```bash
  npm run stripe:setup -- --with-test-accounts
  ```
  Paste the three `whsec_…` secrets it prints into `.env`.
- [ ] **Complete test onboarding.** Open the two onboarding links the script printed. Use Stripe test data: SSN `000-00-0000`, DOB `01/01/1901`, routing `110000000`, account `000123456789`.
- [ ] **Billing settings.** **Settings → Billing → Subscriptions and emails**:
  - Retry schedule: Smart Retries, 4 tries over 2 weeks.
  - When retries end: **mark subscription unpaid**, not cancel.
  - Turn on "Email customers about failed payments".
- [ ] **Customer portal.** **Settings → Billing → Customer portal**. Confirm the script's configuration: payment method update and invoice history on, cancellation off.
- [ ] **Payment methods.** **Settings → Payment methods** (platform defaults that connected accounts inherit): Cards, Apple Pay, Google Pay and Link on. Add `sendkoro.com` under **Payment method domains**. The service also registers it on each restaurant account, which direct charges need.
- [ ] **Risk and fraud.** **Radar** and **Connect → Risk**: review Radar for Platforms and the connected-account risk settings with Stripe, and turn on the fraud controls supported for direct charges.
- [ ] **Team access.** **Settings → Team**. Give developers the *Developer* role, and finance the *Analyst* or *View only* role. Require 2-step login.
- [ ] **Restricted key for the service (recommended).** **Developers → API keys → Create restricted key** with write access to: PaymentIntents, Refunds, Application fees, Transfers, Balance (read), Prices (read), Products (read), Subscriptions, Invoices, Checkout Sessions, Webhook endpoints, Payment method domains, Accounts v2, Account links. Use it as `STRIPE_SECRET_KEY` in production.

## 2. Local webhooks while developing

```bash
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe \
              --forward-connect-to localhost:3000/webhooks/stripe/connect
# copy the printed whsec_… into BOTH STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET for local runs
stripe trigger payment_intent.succeeded --stripe-account acct_<test restaurant>
```

## 3. Live activation (after Stripe answers the review questions)

- [ ] **Activate the platform account** with the legal entity's details: EIN, legal address, the representative's identity, bank account, and statement descriptor `SENDKORO` (used only for subscription charges; food charges show the restaurant's own descriptor).
- [ ] **Public business details.** Support email info@shlglobal.biz, phone +1 917-624-8233, website https://sendkoro.com, and links to your terms and privacy policy.
- [ ] **Repeat Connect setup in live mode** with the same answers as the sandbox.
- [ ] **Re-run the setup script** with the live key (`npm run stripe:setup -- --live`) and set `ALLOW_LIVE_KEYS=true` on the server.
- [ ] **Billing pricing.** Pay-as-you-go. No annual commitment.
- [ ] **Get Stripe's written answers** to the brief's review questions and file them with the account agreement:
  1. Direct charges with Stripe-collected fees, full Dashboard and Stripe-managed losses.
  2. `application_fee_amount` = delivery budget + full driver tip.
  3. Driver transfers funded from application-fee receipts.
  4. Merchant presentation.
  5. Billing eligibility.
  6. A fee schedule for your account.
