import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Cpu, Clock, Mic } from "lucide-react";
import { z } from "zod";
import {
  getBillingStatusFn,
  createCheckoutFn,
  createPortalFn,
  cancelSubscriptionFn,
} from "~/server/billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { CryptoCheckout } from "~/components/billing/crypto-checkout";
import { formatCurrency, formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/billing")({
  validateSearch: z.object({ status: z.enum(["success", "cancelled"]).optional() }),
  loader: () => getBillingStatusFn(),
  component: BillingPage,
});

function BillingPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (search.status === "success") toast.success("Subscription active. Welcome to Pro!");
    if (search.status === "cancelled") toast.message("Checkout cancelled");
  }, [search.status]);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No organization found.
        </CardContent>
      </Card>
    );
  }

  const canBill = ["OWNER", "ADMIN", "BILLING"].includes(data.role);
  const sub = data.subscription;
  const isPro = sub?.plan === "PRO" && sub.status === "ACTIVE";

  async function checkout(plan: "monthly" | "annual") {
    setBusy(true);
    try {
      const res = await createCheckoutFn({ data: { plan } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error("Could not start checkout");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const res = await createPortalFn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error("Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await cancelSubscriptionFn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Subscription will cancel at period end");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  const usageCards = [
    { label: "Minutes transcribed", value: data.usage.minutes, icon: Clock },
    { label: "AI tokens", value: data.usage.tokens.toLocaleString(), icon: Cpu },
    { label: "Sessions", value: data.usage.sessions, icon: Mic },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription, payment methods, and invoices.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Current plan</CardTitle>
            <CardDescription>
              {isPro
                ? `Pro · ${sub?.interval === "ANNUAL" ? "Annual" : "Monthly"}`
                : "Free plan"}
            </CardDescription>
          </div>
          <Badge variant={isPro ? "success" : "secondary"}>
            {sub?.status ?? "ACTIVE"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {sub?.currentPeriodEnd ? (
            <p className="text-sm text-muted-foreground">
              {sub.cancelAtPeriodEnd ? "Cancels on " : "Renews on "}
              {formatDate(sub.currentPeriodEnd)}
            </p>
          ) : null}
          {canBill && isPro ? (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={openPortal} disabled={busy}>
                <ExternalLink className="h-4 w-4" /> Manage in portal
              </Button>
              {!sub?.cancelAtPeriodEnd ? (
                <Button variant="ghost" onClick={cancel} disabled={busy} className="text-destructive">
                  Cancel subscription
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isPro ? (
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            name="Pro Monthly"
            price={formatCurrency(data.plans.monthly.amount)}
            cadence="/month"
            features={["Unlimited sessions", "AI summaries", "Priority support"]}
            onSelect={() => checkout("monthly")}
            disabled={!canBill || busy}
          />
          <PlanCard
            name="Pro Annual"
            price={formatCurrency(data.plans.annual.amount)}
            cadence="/year"
            highlight
            features={["Everything in Monthly", "2 months free", "Early feature access"]}
            onSelect={() => checkout("annual")}
            disabled={!canBill || busy}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {usageCards.map((u) => (
          <Card key={u.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{u.label}</CardTitle>
              <u.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{u.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canBill ? <CryptoCheckout /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.invoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No invoices yet.
            </p>
          ) : (
            <div className="divide-y">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{inv.number ?? inv.stripeInvoiceId}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatCurrency(inv.amountPaid || inv.amountDue, inv.currency)}
                    </span>
                    <Badge variant={inv.status === "paid" ? "success" : "secondary"}>
                      {inv.status}
                    </Badge>
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="View invoice"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
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

function PlanCard({
  name,
  price,
  cadence,
  features,
  onSelect,
  disabled,
  highlight,
}: {
  name: string;
  price: string;
  cadence: string;
  features: string[];
  onSelect: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary shadow-md" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{name}</CardTitle>
          {highlight ? <Badge>Best value</Badge> : null}
        </div>
        <div className="mt-2">
          <span className="text-3xl font-bold">{price}</span>
          <span className="text-sm text-muted-foreground">{cadence}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" /> {f}
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={onSelect} disabled={disabled}>
          Upgrade
        </Button>
      </CardContent>
    </Card>
  );
}
