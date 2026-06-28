import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Download, DollarSign, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getAdminPaymentsFn } from "~/server/payments";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { formatCurrency, formatDate } from "~/lib/utils";

export const Route = createFileRoute("/_app/dashboard/admin")({
  loader: async () => {
    const data = await getAdminPaymentsFn({ data: {} });
    if (!data) throw redirect({ to: "/dashboard" });
    return data;
  },
  component: AdminPayments,
});

type Row = ReturnType<typeof Route.useLoaderData>["payments"][number];

function AdminPayments() {
  const initial = Route.useLoaderData();
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await getAdminPaymentsFn({ data: { search: search.trim() || undefined } });
      if (res) setData(res);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Date", "Email", "Provider", "Plan", "Amount", "Currency", "Status", "Reference"];
    const lines = data.payments.map((p: Row) =>
      [
        new Date(p.createdAt).toISOString(),
        p.email,
        p.provider,
        p.plan,
        (p.amount / 100).toFixed(2),
        p.currency,
        p.status,
        p.reference,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olat5-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stats = [
    { label: "Total revenue", value: formatCurrency(data.totalRevenue, "usd"), icon: DollarSign },
    { label: "Successful", value: data.counts.success.toLocaleString(), icon: CheckCircle2 },
    { label: "Failed", value: data.counts.failed.toLocaleString(), icon: XCircle },
    { label: "Pending", value: data.counts.pending.toLocaleString(), icon: Clock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Payments admin</h1>
          <p className="text-sm text-muted-foreground">Revenue, providers, and transactions for your organization.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={data.payments.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-[#0F172A]">{s.value}</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                <s.icon className="h-5 w-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue by provider */}
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-[#0F172A]">Revenue by provider</p>
          {data.byProvider.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No successful payments yet.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.byProvider.map((p) => (
                <div key={p.provider} className="flex items-center justify-between rounded-xl bg-[#F8FAFC] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">{p.provider}</p>
                    <p className="text-xs text-muted-foreground">{p.count} payment{p.count === 1 ? "" : "s"}</p>
                  </div>
                  <p className="text-lg font-bold tabular-nums text-[#0F172A]">{formatCurrency(p.revenue, "usd")}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search + table */}
      <Card>
        <CardContent className="p-0">
          <form onSubmit={runSearch} className="flex items-center gap-2 border-b border-border p-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email or transaction reference"
                className="pl-9"
              />
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</Button>
          </form>

          {data.payments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">No payments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Provider</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p: Row) => (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3 text-[#0F172A]">{p.email}</td>
                      <td className="px-4 py-3">{p.provider}</td>
                      <td className="px-4 py-3">{p.plan === "CREDITS" ? "Credits" : "Pro"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{formatCurrency(p.amount, p.currency)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "destructive" : "secondary"}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-muted-foreground" title={p.reference}>
                        {p.reference}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
