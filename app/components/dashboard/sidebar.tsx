import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Mic,
  FileText,
  FolderOpen,
  CreditCard,
  Settings,
  LifeBuoy,
  X,
  ArrowUpRight,
} from "lucide-react";
import { cn, initials } from "~/lib/utils";
import { Logo } from "~/components/brand/logo";

const NAV = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/dashboard/sessions", label: "Interview Sessions", icon: Mic },
  { to: "/dashboard/resume", label: "Resume Library", icon: FileText },
  { to: "/dashboard/job-descriptions", label: "Documents", icon: FolderOpen },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
  { to: "/dashboard/support", label: "Support", icon: LifeBuoy },
] as const;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  user: { email: string; profile: { fullName: string | null; avatarUrl: string | null } | null };
  credits: { remaining: number; allocation: number; used: number; plan: string };
}

export function Sidebar({ open, onClose, user, credits }: SidebarProps) {
  const { location } = useRouterState();
  const low = credits.remaining <= 5;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" onClick={onClose} aria-hidden />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-border bg-white transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link to="/dashboard" className="flex items-center" onClick={onClose}>
            <Logo height={28} />
          </Link>
          <button
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-[#F1F5F9] lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
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
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#DBEAFE] text-[#2563EB]"
                    : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
                )}
              >
                <item.icon className={cn("h-[18px] w-[18px]", active ? "text-[#2563EB]" : "text-[#94A3B8]")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom area: credits, plan, upgrade, profile */}
        <div className="space-y-3 border-t border-border p-3">
          <div className={cn("rounded-xl border p-3", low ? "border-[#FECACA] bg-[#FEF2F2]" : "border-border bg-[#F8FAFC]")}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Credits</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2563EB] ring-1 ring-border">
                {credits.plan}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={cn("text-2xl font-bold tabular-nums", low ? "text-[#EF4444]" : "text-[#0F172A]")}>
                {credits.remaining.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">left</span>
            </div>
            {credits.allocation > 0 ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div
                  className="h-full rounded-full bg-[#2563EB]"
                  style={{ width: `${Math.min(100, (credits.remaining / credits.allocation) * 100)}%` }}
                />
              </div>
            ) : null}
            <Link
              to="/dashboard/billing"
              onClick={onClose}
              className="mt-2.5 flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#3B82F6] px-3 py-2 text-xs font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              Upgrade plan <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Link
            to="/dashboard/settings"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#F1F5F9]"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#DBEAFE] text-sm font-semibold text-[#2563EB]">
              {initials(user.profile?.fullName, user.email)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-[#0F172A]">
                {user.profile?.fullName ?? "Account"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Link>
        </div>
      </aside>
    </>
  );
}
