import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Check, Coins, Clock, Star } from "lucide-react";
import { z } from "zod";
import { getBillingStatusFn } from "~/server/billing";
import { createCreditCheckoutFn, createSubscriptionCheckoutFn } from "~/server/payments";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { formatCurrency, formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/billing")({
  validateSearch: z.object({ status: z.enum(["success", "cancelled"]).optional() }),
  loader: () => getBillingStatusFn(),
  component: BillingPage,
});

type Busy = string | null;

type PayMethod = "paystack" | "cryptomus";

function BillingPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const [busy, setBusy] = useState<Busy>(null);
  const [method, setMethod] = useState<PayMethod>(data?.paystackConfigured ? "paystack" : "cryptomus");

  useEffect(() => {
    if (search.status === "success") toast.success("Payment received — your credits will be added shortly.");
    if (search.status === "cancelled") toast.message("Checkout cancelled");
  }, [search.status]);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">No organization found.</CardContent>
      </Card>
    );
  }

  const canBill = ["OWNER", "ADMIN", "BILLING"].includes(data.role);
  const sub = data.subscription;
  const isPro = sub?.plan === "PRO" && sub.status === "ACTIVE";

  async function go(
    fn: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>,
    key: string,
  ) {
    if (!canBill) {
      toast.error("You don't have permission to manage billing.");
      return;
    }
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) {
        toast.error(
          res.error === "CRYPTO_NOT_CONFIGURED"
            ? "Crypto checkout isn't configured yet."
            : res.error === "PAYSTACK_NOT_CONFIGURED"
              ? "Paystack isn't configured yet."
              : res.error,
        );
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error("Could not start checkout");
    } finally {
      setBusy(null);
    }
  }

  const packs = [
    { key: "starter" as const, ...data.packs.starter, blurb: "Best for trying things out", highlight: false },
    { key: "pro" as const, ...data.packs.pro, blurb: "Most popular for active job seekers", highlight: true },
    { key: "business" as const, ...data.packs.business, blurb: "For heavy interview prep", highlight: false },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Billing & credits</h1>
        <p className="text-sm text-muted-foreground">
          1 credit = 30 minutes of live Interview Copilot. Pay by card or bank with Paystack, or with crypto via Cryptomus.
        </p>
      </div>

      {/* ── Current user area ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Current plan" value={isPro ? `Pro · ${sub?.interval === "ANNUAL" ? "Annual" : "Monthly"}` : "Free"} icon={Star}>
          {sub?.currentPeriodEnd ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {sub.cancelAtPeriodEnd ? "Access until " : "Renews "}
              {formatDate(sub.currentPeriodEnd)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No active subscription</p>
          )}
        </StatCard>
        <StatCard label="Credit balance" value={data.credits.balance.toLocaleString()} icon={Coins}>
          <p className="mt-1 text-xs text-muted-foreground">of {data.credits.allocation.toLocaleString()} / cycle</p>
        </StatCard>
        <StatCard label="Remaining minutes" value={data.credits.remainingMinutes.toLocaleString()} icon={Clock}>
          <p className="mt-1 text-xs text-muted-foreground">{data.credits.balance.toLocaleString()} × 30 min</p>
        </StatCard>
      </div>

      {/* ── Payment method selector ── */}
      <div>
        <p className="mb-2 text-sm font-medium text-[#0F172A]">Payment method</p>
        <div className="inline-flex gap-1 rounded-xl border border-border bg-white p-1">
          {[
            { key: "paystack" as const, label: "Card / Bank", sub: "Paystack", on: data.paystackConfigured },
            { key: "cryptomus" as const, label: "Crypto", sub: "USDT · BTC · ETH", on: data.cryptoConfigured },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={!m.on}
              onClick={() => setMethod(m.key)}
              className={
                "flex flex-col items-start rounded-lg px-4 py-2 text-left transition-colors " +
                (method === m.key ? "bg-[#DBEAFE] text-[#2563EB]" : "text-muted-foreground hover:bg-[#F8FAFC]") +
                (!m.on ? " cursor-not-allowed opacity-40" : "")
              }
            >
              <span className="text-sm font-semibold">{m.label}</span>
              <span className="text-[11px]">
                {m.sub}
                {!m.on ? " (not configured)" : ""}
              </span>
            </button>
          ))}
        </div>
        {!data.paystackConfigured && !data.cryptoConfigured ? (
          <p className="mt-2 rounded-xl bg-[#FEF3C7] px-4 py-2.5 text-sm text-[#92400E]">
            No payment provider is configured. Set Paystack or Cryptomus keys to enable purchases.
          </p>
        ) : null}
      </div>

      {/* ── Pricing tabs ── */}
      <Tabs defaultValue="credits" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="credits">Credits</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
        </TabsList>

        {/* Credits */}
        <TabsContent value="credits" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="grid items-stretch gap-5 md:grid-cols-3"
          >
            {packs.map((p) => (
              <PricingCard
                key={p.key}
                highlight={p.highlight}
                badge={p.highlight ? "Most popular" : undefined}
                name={p.label}
                price={`$${p.amount.replace(/\.00$/, "")}`}
                cadence="one-time"
                headline={`${p.credits} credits`}
                subline={`${(p.credits * 30).toLocaleString()} minutes included`}
                blurb={p.blurb}
                features={[`${p.credits} credits added instantly`, `${(p.credits * 30).toLocaleString()} live minutes`, "Never expires", "Use anytime"]}
                cta={`Buy ${p.label}`}
                loading={busy === `pack:${p.key}`}
                disabled={!canBill || busy !== null}
                onSelect={() => go(() => createCreditCheckoutFn({ data: { pack: p.key, method } }), `pack:${p.key}`)}
              />
            ))}
          </motion.div>
        </TabsContent>

        {/* Subscription */}
        <TabsContent value="subscription" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="grid items-stretch gap-5 md:grid-cols-2 lg:max-w-3xl"
          >
            <PricingCard
              name="Monthly Pro"
              price="$49"
              cadence="/month"
              headline="Unlimited interview sessions"
              subline="300 interview credits every month"
              blurb="Everything you need for an active interview season."
              features={[
                "Unlimited interview sessions",
                "300 interview credits every month",
                "AI Interview Copilot",
                "Resume analysis",
                "Live interview assistance",
                "Session transcripts",
                "Priority support",
              ]}
              cta={isPro && sub?.interval === "MONTHLY" ? "Current plan" : "Choose Monthly"}
              loading={busy === "sub:monthly"}
              disabled={!canBill || busy !== null || (isPro && sub?.interval === "MONTHLY")}
              onSelect={() => go(() => createSubscriptionCheckoutFn({ data: { plan: "monthly", method } }), "sub:monthly")}
            />
            <PricingCard
              highlight
              badge="Best value · Save 52%"
              name="Annual Pro"
              price="$285"
              cadence="/year"
              headline="Unlimited interview sessions"
              subline="3,600 interview credits yearly"
              blurb="Save over two months compared to paying monthly."
              features={[
                "Unlimited interview sessions",
                "3,600 interview credits yearly",
                "Everything included in Monthly Pro",
                "Save 52% annually",
                "Early access to new features",
                "Priority support",
              ]}
              cta={isPro && sub?.interval === "ANNUAL" ? "Current plan" : "Choose Annual"}
              loading={busy === "sub:annual"}
              disabled={!canBill || busy !== null || (isPro && sub?.interval === "ANNUAL")}
              onSelect={() => go(() => createSubscriptionCheckoutFn({ data: { plan: "annual", method } }), "sub:annual")}
            />
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* ── Payment history ── */}
      <Card>
        <CardContent className="p-0">
          <p className="border-b border-border px-6 py-4 text-sm font-semibold text-[#0F172A]">Payment history</p>
          {data.payments.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="divide-y">
              {data.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{p.plan === "CREDITS" ? "Credit pack" : "Pro subscription"}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatCurrency(p.amount, p.currency)}</span>
                    <Badge variant="success">{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  icon: typeof Coins;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-[#0F172A]">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function PricingCard({
  name,
  price,
  cadence,
  headline,
  subline,
  blurb,
  features,
  cta,
  onSelect,
  disabled,
  loading,
  highlight,
  badge,
}: {
  name: string;
  price: string;
  cadence: string;
  headline: string;
  subline: string;
  blurb: string;
  features: string[];
  cta: string;
  onSelect: () => void;
  disabled?: boolean;
  loading?: boolean;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={
        "relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md " +
        (highlight ? "border-[#2563EB] ring-1 ring-[#2563EB]" : "border-border")
      }
    >
      {badge ? (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-3 py-1 text-xs font-semibold text-white shadow">
          {badge}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-[#0F172A]">{name}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-[#0F172A]">{price}</span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>
      <div className="mt-3 rounded-xl bg-[#EFF6FF] px-4 py-3">
        <p className="text-base font-bold text-[#2563EB]">{headline}</p>
        <p className="text-xs font-medium text-[#1D4ED8]">{subline}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{blurb}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-[#334155]">
            <Check className="h-4 w-4 flex-none text-[#2563EB]" /> {f}
          </li>
        ))}
      </ul>
      <Button
        className="mt-6 w-full"
        variant={highlight ? "default" : "secondary"}
        onClick={onSelect}
        disabled={disabled}
      >
        {loading ? "Starting checkout…" : cta}
      </Button>
    </div>
  );
}
