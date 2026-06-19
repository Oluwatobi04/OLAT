import Stripe from "stripe";

// Fall back to a placeholder so the client can be constructed at import time
// even when the key is absent; real Stripe calls still require a valid key.
const key = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";

export const stripe = new Stripe(key, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

export const PLANS = {
  monthly: {
    label: "Pro Monthly",
    interval: "MONTHLY" as const,
    priceId: process.env.STRIPE_PRICE_MONTHLY ?? "",
    amount: 2900,
  },
  annual: {
    label: "Pro Annual",
    interval: "ANNUAL" as const,
    priceId: process.env.STRIPE_PRICE_ANNUAL ?? "",
    amount: 29000,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export function planKeyForPrice(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null;
  if (priceId === PLANS.monthly.priceId) return "monthly";
  if (priceId === PLANS.annual.priceId) return "annual";
  return null;
}
