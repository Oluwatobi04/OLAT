import crypto from "node:crypto";

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";
const WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || SECRET_KEY;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

// Paystack charges in the subunit of the chosen currency. Nigerian accounts
// typically settle in NGN; the catalog is priced in USD, so we convert at a
// configurable rate. Set PAYSTACK_CURRENCY=USD to charge USD directly.
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || "NGN").toUpperCase();
const USD_TO_NGN = Number(process.env.PAYSTACK_USD_TO_NGN || "1600");

const BASE_URL = "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return Boolean(SECRET_KEY);
}

export class PaystackError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "PaystackError";
  }
}

// Converts a canonical USD amount (in cents) to the Paystack charge in the
// configured currency's subunit. USD → cents (1:1); NGN → kobo via the rate.
export function paystackChargeAmount(usdCents: number): { amount: number; currency: string } {
  if (PAYSTACK_CURRENCY === "USD") return { amount: usdCents, currency: "USD" };
  // kobo = usdDollars * rate * 100 = usdCents * rate
  return { amount: Math.round(usdCents * USD_TO_NGN), currency: PAYSTACK_CURRENCY };
}

// Initialize a transaction. Returns the hosted checkout URL + the reference.
export async function initTransaction(opts: {
  email: string;
  usdCents: number;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<{ authorizationUrl: string; reference: string }> {
  if (!isPaystackConfigured()) throw new PaystackError("Paystack is not configured");
  const { amount, currency } = paystackChargeAmount(opts.usdCents);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: opts.email,
        amount,
        currency,
        reference: opts.reference,
        callback_url: `${APP_URL}/dashboard/billing?status=success`,
        metadata: opts.metadata ?? {},
      }),
    });
  } catch (err) {
    throw new PaystackError("Could not reach Paystack", err);
  }

  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };
  if (!res.ok || !json.status || !json.data?.authorization_url) {
    throw new PaystackError(json.message || `Paystack init failed (${res.status})`);
  }
  return { authorizationUrl: json.data.authorization_url, reference: json.data.reference ?? opts.reference };
}

// Server-side verification — never trust the webhook/frontend alone.
export async function verifyTransaction(reference: string): Promise<{
  status: string; // "success" | "failed" | "abandoned" | ...
  amount: number;
  currency: string;
}> {
  if (!isPaystackConfigured()) throw new PaystackError("Paystack is not configured");
  const res = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET_KEY}` },
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    data?: { status?: string; amount?: number; currency?: string };
  };
  if (!res.ok || !json.status || !json.data) {
    throw new PaystackError(`Paystack verify failed (${res.status})`);
  }
  return {
    status: json.data.status ?? "unknown",
    amount: json.data.amount ?? 0,
    currency: json.data.currency ?? PAYSTACK_CURRENCY,
  };
}

// Verifies the x-paystack-signature header: HMAC-SHA512 of the raw body using
// the secret. Uses a timing-safe comparison.
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac("sha512", WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
