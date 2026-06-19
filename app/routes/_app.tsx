import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSessionUser, requireAuth } from "~/lib/auth.server";
import { Sidebar } from "~/components/dashboard/sidebar";
import { TopNav } from "~/components/dashboard/topnav";

// Server guard: resolves the full auth context or redirects to /login.
const loadAuth = createServerFn({ method: "GET" }).handler(async () => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) throw redirect({ to: "/login" });
  return requireAuth();
});

export const Route = createFileRoute("/_app")({
  loader: () => loadAuth(),
  component: AppLayout,
});

function AppLayout() {
  const auth = Route.useLoaderData();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="bg-aurora flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col px-3 pb-4 lg:px-4">
        <div className="pt-3">
          <TopNav
            onMenuClick={() => setSidebarOpen(true)}
            user={auth.user}
            organization={auth.organization}
          />
        </div>
        <main className="flex-1 py-6 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
