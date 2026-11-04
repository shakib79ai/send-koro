# Send Koro

NYC food-delivery marketplace: $0 commission for restaurants, a flat monthly plan, and Stripe Connect direct charges.

This repository is set up for **VS Code + Claude Code**. Claude Code reads `CLAUDE.md` automatically, so it knows the business rules, commands and design links from the first prompt.

## What's here

| Path | What it is |
|---|---|
| `services/payments/` | Payments service: NestJS 11, Drizzle, Postgres, Stripe Connect (direct charges, delivery allocation, driver payouts, restaurant plans). 56 tests. |
| `docs/BUSINESS_MODEL.md` | Every business decision so far: pricing, fees, tax policy, delivery rules, driver pay. |
| `docs/STRIPE_TECHNICAL_BRIEF.md` | The Stripe developer brief (v1.2). |
| `docs/STRIPE_DASHBOARD_CHECKLIST.md` | Stripe settings only a person can make in the Dashboard. |
| `docs/DESIGNS.md` | Links to the approved designs for all apps (customer, restaurant, driver, admin). |
| `CLAUDE.md` | Instructions Claude Code follows: rules, commands, conventions. |
| `.claude/commands/` | Slash commands: `/test`, `/stripe-setup`, `/new-migration`, `/check-business-rules`, `/tier-job`. |
| `.claude/settings.json` | Pre-approved safe commands. Blocks reading `.env` files and anything with live Stripe keys. |
| `.mcp.json` | Stripe's official MCP server, so Claude Code can look things up in your Stripe sandbox. |
| `.vscode/` | Recommended extensions, debug configurations and tasks. |
| `docker-compose.yml` | Local Postgres (dev and test databases) on port 5433. |

## First-time setup (about 10 minutes)

You need **Node 22**, **Docker Desktop**, **VS Code**, the **Stripe CLI** (`npm install -g @stripe/cli`) and **Claude Code**.

1. **Unzip the project and open the folder in VS Code.** Install the recommended extensions when prompted: Claude Code, Stripe, Vitest, Docker, Prettier.
2. **In the VS Code terminal:**
   ```bash
   npm run setup          # installs the payments service
   npm run db:up          # starts Postgres in Docker
   cp services/payments/.env.example services/payments/.env
   ```
3. **Edit `services/payments/.env` yourself.** Paste your Stripe **sandbox** keys (`sk_test_…`, `pk_test_…`) from Dashboard → Developers → API keys. Never paste keys into Claude.
4. **Run the migrations and tests:**
   ```bash
   npm run db:migrate
   npm test               # should show 56 passed
   ```
5. **Connect Stripe tooling:**
   ```bash
   stripe login           # approve in your browser
   stripe agent setup     # adds Stripe's skills to Claude Code
   ```
6. **Start Claude Code** in the project folder (the Claude Code panel in VS Code, or `claude` in the terminal):
   - The first time, approve the **stripe** MCP server and sign in to Stripe in the browser window it opens. Choose your **sandbox**.
   - Try `/test`, then `/stripe-setup`.
7. **Do the Dashboard-only steps** in `docs/STRIPE_DASHBOARD_CHECKLIST.md`. Connect settings come first.

## Everyday commands

```bash
npm run dev            # payments service on http://localhost:3000
npm run stripe:listen  # forward Stripe webhooks to your local service
npm test               # all tests (Postgres must be running)
npm run typecheck
```

In VS Code: **Run and Debug → "Payments: run & debug"**, or open a test file and use **"Payments: debug this test file"**. Tasks for the same commands are under **Terminal → Run Task**.

## Good first prompts for Claude Code

- "Read docs/BUSINESS_MODEL.md and summarise how a $39 order with free delivery is split between the restaurant, Send Koro and the driver."
- "Add the delivery fee share to the delivery price at quote time, with tests." (This is the recommended open item.)
- "Build the Uber Direct dispatch integration that calls `settlement.supplierAssigned` and submits the full tip through the tip field."
- "/check-business-rules" before every commit.

## Safety

- **Sandbox first.** Live keys are refused unless you set `ALLOW_LIVE_KEYS=true` on the production server.
- `.env` files are git-ignored, and Claude Code is blocked from reading them.
- Use a **restricted key** in production (permissions are listed in the checklist).
