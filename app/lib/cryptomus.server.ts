import crypto from "node:crypto";

const API_KEY = process.env.CRYPTOMUS_API_KEY ?? "";
const MERCHANT_ID = process.env.CRYPTOMUS_MERCHANT_ID ?? "";
const BASE_URL = "https://api.cryptomus.com/v1";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export function isCryptomusConfigured(): boolean {
  return Boolean(API_KEY && MERCHANT_ID);
}

export class CryptomusError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "CryptomusError";
  }
}

// Cryptomus sign = md5( base64( json_body ) + API_KEY ).
// PHP's json_encode escapes forward slashes, so we mirror that for parity.
function makeSign(jsonBody: string): string {
  const b64 = Buffer.from(jsonBody).toString("base64");
  return crypto.createHash("md5").update(b64 + API_KEY).digest("hex");
}

function encodeBody(payload: Record<string, unknown>): string {
  return JSON.stringify(payload).replace(/\//g, "\\/");
}

export interface CreateInvoiceInput {
  amount: string; // fiat decimal string, e.g. "12.99"
  currency: string; // e.g. "USD"
  orderId: string;
  asset?: "USDT" | "BTC" | "ETH";
  successUrl?: string;
}

export interface CryptomusInvoice {
  uuid: string;
  url: string;
  orderId: string;
  status: string;
}

// Create a hosted crypto invoice. The payer chooses USDT/BTC/ETH on the page;
// `asset` pre-selects a preferred currency when provided.
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CryptomusInvoice> {
  if (!isCryptomusConfigured()) {
    throw new CryptomusError("Cryptomus is not configured");
  }

  const payload: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency,
    order_id: input.orderId,
    url_callback: `${APP_URL}/api/cryptomus/webhook`,
    url_return: `${APP_URL}/dashboard/billing`,
    url_success: input.successUrl ?? `${APP_URL}/dashboard/billing?status=success`,
    lifetime: 3600,
  };
  if (input.asset) payload.to_currency = input.asset;

  const body = encodeBody(payload);
  const res = await fetch(`${BASE_URL}/payment`, {
    method: "POST",
    headers: {
      merchant: MERCHANT_ID,
      sign: makeSign(body),
      "Content-Type": "application/json",
    },
    body,
  });

  const json = (await res.json().catch(() => null)) as
    | { state?: number; result?: Record<string, unknown>; message?: string }
    | null;

  if (!res.ok || !json || json.state !== 0 || !json.result) {
    throw new CryptomusError(json?.message ?? `Cryptomus error (${res.status})`, json);
  }

  return {
    uuid: String(json.result.uuid),
    url: String(json.result.url),
    orderId: String(json.result.order_id),
    status: String(json.result.status ?? "check"),
  };
}

// Verify a webhook payload's signature. The provider signs the JSON body with
// the `sign` field removed.
export function verifyWebhookSign(payload: Record<string, unknown>): boolean {
  if (!API_KEY) return false;
  const provided = payload.sign;
  if (typeof provided !== "string") return false;
  const { sign: _omit, ...rest } = payload;
  const expected = makeSign(encodeBody(rest));
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

// Cryptomus payment statuses that mean funds were received.
export function isPaidStatus(status: string): boolean {
  return ["paid", "paid_over"].includes(status);
}
