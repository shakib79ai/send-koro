import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/, 'must be a Stripe secret or restricted key'),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_').optional(),
  STRIPE_PLATFORM_ACCOUNT_ID: z.string().startsWith('acct_').optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_THIN_EVENTS_SECRET: z.string().startsWith('whsec_').optional(),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  RESTAURANT_PORTAL_URL: z.string().url(),
  DRIVER_APP_URL: z.string().url(),
  PAYMENT_METHOD_DOMAIN: z.string().default('sendkoro.com'),
  DATABASE_URL: z.string().min(1),
  EST_STRIPE_FEE_BPS: z.coerce.number().int().min(0).default(290),
  EST_STRIPE_FEE_FIXED_CENTS: z.coerce.number().int().min(0).default(30),
  FIRST_MONTH_FREE: bool.default('true'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error('Invalid environment:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
  }
  if (parsed.data.STRIPE_SECRET_KEY.includes('_live_') && source.ALLOW_LIVE_KEYS !== 'true') {
    throw new Error('Live Stripe key refused. Build and test with a sandbox key; set ALLOW_LIVE_KEYS=true only in production.');
  }
  return parsed.data;
}
