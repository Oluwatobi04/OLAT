import { Link, useRouter } from "@tanstack/react-router";
import { Menu, LogOut, User as UserIcon, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { initials } from "~/lib/utils";
import { signOutFn } from "~/server/auth";

export function TopNav({
  onMenuClick,
  user,
  organization,
}: {
  onMenuClick: () => void;
  user: { email: string; profile: { fullName: string | null; avatarUrl: string | null } | null };
  organization: { name: string; role: string } | null;
}) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOutFn();
      toast.success("Signed out");
      await router.navigate({ to: "/login" });
    } catch {
      toast.error("Sign out failed");
    }
  }

  return (
    <header className="glass sticky top-0 z-20 flex h-16 items-center justify-between rounded-2xl px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 lg:hidden"
          onClick={onMenuClick}
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        {organization ? (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{organization.name}</span>
            <Badge variant="secondary">{organization.role}</Badge>
          </div>
        ) : null}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-9 w-9">
              {user.profile?.avatarUrl ? (
                <AvatarImage src={user.profile.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>
                {initials(user.profile?.fullName, user.email)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="truncate font-medium">
                {user.profile?.fullName ?? "Account"}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard/settings">
              <UserIcon className="h-4 w-4" /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/dashboard/billing">
              <Building2 className="h-4 w-4" /> Billing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut} className="text-destructive">
            <LogOut className="h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
