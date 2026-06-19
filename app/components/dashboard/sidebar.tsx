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

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/dashboard/resume", label: "Resume Analyzer", icon: FileText },
  { to: "/dashboard/job-descriptions", label: "Job Descriptions", icon: Briefcase },
  { to: "/dashboard/interview-prep", label: "Interview Prep", icon: ClipboardList },
  { to: "/dashboard/mock", label: "Mock Interviews", icon: MessagesSquare },
  { to: "/dashboard/sessions", label: "Live Sessions", icon: Mic },
  { to: "/dashboard/credits", label: "Credits", icon: Coins },
  { to: "/dashboard/team", label: "Team", icon: Users },
  { to: "/dashboard/organization", label: "Organization", icon: Building2 },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { location } = useRouterState();

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              O
            </span>
            OLat5
          </Link>
          <button
            className="rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-3">
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
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-4 text-xs text-muted-foreground">
          OLat5 · v0.1.0
        </div>
      </aside>
    </>
  );
}
