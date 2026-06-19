import { useState } from "react";
import { toast } from "sonner";
import { Bitcoin, Coins } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { createCryptoCheckoutFn } from "~/server/payments";

const PLANS = [
  { id: "PRO" as const, label: "Pro", price: "$12.99/mo", credits: "60 credits" },
  { id: "TEAM" as const, label: "Team", price: "$49/mo", credits: "200 credits" },
];
const ASSETS = ["USDT", "BTC", "ETH"] as const;

export function CryptoCheckout() {
  const [plan, setPlan] = useState<"PRO" | "TEAM">("PRO");
  const [asset, setAsset] = useState<(typeof ASSETS)[number]>("USDT");
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const res = await createCryptoCheckoutFn({ data: { plan, asset } });
      if (!res.ok) {
        toast.error(
          res.error === "CRYPTO_NOT_CONFIGURED"
            ? "Crypto payments aren't configured."
            : res.error,
        );
        return;
      }
      window.location.href = res.url;
    } catch {
      toast.error("Could not start crypto checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bitcoin className="h-4 w-4 text-[#F59E0B]" /> Pay with crypto
        </CardTitle>
        <CardDescription>USDT, BTC, or ETH via Cryptomus — credits are added on confirmation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className={
                "rounded-xl border p-4 text-left transition-all " +
                (plan === p.id
                  ? "border-blue-400/40 bg-gradient-to-br from-blue-500/10 to-purple-500/10"
                  : "border-white/10 hover:border-white/20")
              }
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.label}</span>
                <span className="text-sm text-[#60a5fa]">{p.price}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{p.credits} / month</p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Asset:</span>
          {ASSETS.map((a) => (
            <button
              key={a}
              onClick={() => setAsset(a)}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-all " +
                (asset === a
                  ? "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10")
              }
            >
              {a}
            </button>
          ))}
        </div>

        <Button onClick={pay} disabled={busy} className="w-full">
          <Coins className="h-4 w-4" />
          {busy ? "Creating invoice…" : `Pay ${plan === "PRO" ? "$12.99" : "$49"} with ${asset}`}
        </Button>
      </CardContent>
    </Card>
  );
}
