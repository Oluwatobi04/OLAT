import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Copy, Check } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/_app/dashboard/support")({
  component: SupportPage,
});

const EMAILS = ["Fisayoolatoke@gmail.com", "takokeowo12@gmail.com"];

function SupportPage() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      toast.success("Email copied");
      setTimeout(() => setCopied((c) => (c === email ? null : c)), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Support</h1>
        <p className="text-sm text-muted-foreground">Need help?</p>
      </div>

      <Card className="mx-auto w-full max-w-xl">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#2563EB]">
              <Mail className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-semibold text-[#0F172A]">Contact us</p>
              <p className="mt-1 text-sm text-muted-foreground">
                For support, bug reports, billing issues, or account assistance, please reach out to us:
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {EMAILS.map((email) => (
              <div
                key={email}
                className="flex flex-col gap-3 rounded-xl border border-border bg-[#F8FAFC] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <a
                  href={`mailto:${email}`}
                  className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-[#0F172A] hover:text-[#2563EB]"
                >
                  <Mail className="h-4 w-4 flex-none text-[#2563EB]" />
                  <span className="truncate">{email}</span>
                </a>
                <Button variant="secondary" size="sm" onClick={() => copy(email)} className="flex-none">
                  {copied === email ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === email ? "Copied" : "Copy"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
