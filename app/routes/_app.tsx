import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { requireAuth } from "~/lib/auth.server";
import { ensureCreditBalance } from "~/lib/credits.server";
import { Sidebar } from "~/components/dashboard/sidebar";
import { TopNav } from "~/components/dashboard/topnav";

// Server guard: resolves auth + a live credit snapshot, or redirects to /login.
// requireAuth already reads the session and redirects when unauthenticated, so
// we don't call getSessionUser separately (that's a duplicate Supabase getUser).
const loadAuth = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  // find-or-create: brand-new users get the balance from the signup transaction;
  // users created before that fix get it backfilled here once. Never shows 0.
  const bal = await ensureCreditBalance(auth.userId, auth.organization?.id ?? null);
  return {
    ...auth,
    credits: {
      remaining: bal.currentBalance,
      allocation: bal.monthlyAllocation,
      used: Math.max(0, bal.monthlyAllocation - bal.currentBalance),
      plan: bal.planType,
    },
  };
});

export const Route = createFileRoute("/_app")({
  loader: () => loadAuth(),
  component: AppLayout,
});

function AppLayout() {
  const auth = Route.useLoaderData();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={auth.user}
        credits={auth.credits}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          onMenuClick={() => setSidebarOpen(true)}
          user={auth.user}
          organization={auth.organization}
        />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
