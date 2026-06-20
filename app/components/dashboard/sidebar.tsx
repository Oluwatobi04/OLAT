import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Mic,
  FileText,
  Briefcase,
  ClipboardList,
  MessagesSquare,
  Coins,
  Users,
  Building2,
  CreditCard,
  Settings,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Logo } from "~/components/brand/logo";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashboard/resume", label: "Resume Analyzer", icon: FileText },
  { to: "/dashboard/job-descriptions", label: "Job Descriptions", icon: Briefcase },
  { to: "/dashboard/interview-prep", label: "Interview Prep", icon: ClipboardList },
  { to: "/dashboard/mock", label: "Mock Interviews", icon: MessagesSquare },
  { to: "/dashboard/live", label: "Live Interview", icon: Mic },
  { to: "/dashboard/credits", label: "Credits", icon: Coins },
  { to: "/dashboard/team", label: "Team", icon: Users },
  { to: "/dashboard/organization", label: "Organization", icon: Building2 },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { location } = useRouterState();

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col p-3 transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="glass-strong flex h-full flex-col rounded-2xl">
          <div className="flex h-16 items-center justify-between px-4">
            <Link to="/dashboard" className="flex items-center">
              <Logo height={30} />
            </Link>
            <button
              className="rounded-md p-1 text-muted-foreground hover:bg-white/5 lg:hidden"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {NAV.map((item) => {
              const active =
                item.to === "/dashboard"
                  ? location.pathname === "/dashboard"
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white shadow-sm"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#3B82F6] to-[#8B5CF6]" />
                  ) : null}
                  <item.icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      active ? "text-[#60a5fa]" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-white/5 p-4 text-xs text-muted-foreground">
            <span className="text-gradient font-semibold">OLat5</span> · v0.1.0
          </div>
        </div>
      </aside>
    </>
  );
}
