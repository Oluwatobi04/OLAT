import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSessionUser, requireAuth } from "~/lib/auth.server";
import { prisma } from "~/lib/db.server";
import { Sidebar } from "~/components/dashboard/sidebar";
import { TopNav } from "~/components/dashboard/topnav";

// Server guard: resolves auth + a live credit snapshot, or redirects to /login.
const loadAuth = createServerFn({ method: "GET" }).handler(async () => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) throw redirect({ to: "/login" });
  const auth = await requireAuth();
  const bal = await prisma.creditBalance.findUnique({ where: { userId: auth.userId } });
  return {
    ...auth,
    credits: {
      remaining: bal?.currentBalance ?? 0,
      allocation: bal?.monthlyAllocation ?? 0,
      used: Math.max(0, (bal?.monthlyAllocation ?? 0) - (bal?.currentBalance ?? 0)),
      plan: bal?.planType ?? "FREE",
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
