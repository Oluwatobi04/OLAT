import { createFileRoute } from "@tanstack/react-router";
import { LifeBuoy, Mail, BookOpen, MessageSquare } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/_app/dashboard/support")({
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Support</h1>
        <p className="text-sm text-muted-foreground">We're here to help you land the job.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { icon: Mail, title: "Email support", body: "Get a reply within one business day.", cta: "Email us", href: "mailto:support@olat5.com" },
          { icon: BookOpen, title: "Help center", body: "Guides for sessions, billing, and the workspace.", cta: "Open docs", href: "#" },
          { icon: MessageSquare, title: "Live chat", body: "Chat with the team during business hours.", cta: "Start chat", href: "#" },
          { icon: LifeBuoy, title: "Report an issue", body: "Something not working? Let us know.", cta: "Report", href: "mailto:support@olat5.com" },
        ].map((c) => (
          <Card key={c.title}>
            <CardContent className="flex items-start gap-4 p-6">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#DBEAFE] text-[#2563EB]">
                <c.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-[#0F172A]">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                <Button variant="secondary" size="sm" className="mt-3" asChild>
                  <a href={c.href}>{c.cta}</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
