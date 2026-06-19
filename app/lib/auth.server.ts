import { redirect } from "@tanstack/react-router";
import { getSupabaseServerClient } from "./supabase.server";
import { prisma } from "./db.server";
import { slugify } from "./utils";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface AuthContext {
  userId: string;
  email: string;
  user: {
    id: string;
    email: string;
    profile: { fullName: string | null; avatarUrl: string | null } | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null;
}

// Reads the Supabase session and returns the authenticated user, or null.
export async function getSessionUser(): Promise<SupabaseUser | null> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

// Ensures an application User + Profile exist for a Supabase auth user, and
// bootstraps a personal Organization + OWNER membership on first login.
export async function ensureUserRecord(authUser: SupabaseUser): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true },
  });

  const fullName =
    (authUser.user_metadata?.full_name as string | undefined) ??
    (authUser.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl =
    (authUser.user_metadata?.avatar_url as string | undefined) ?? null;

  if (existing) {
    await prisma.user.update({
      where: { id: authUser.id },
      data: {
        email: authUser.email ?? "",
        emailVerified: authUser.email_confirmed_at
          ? new Date(authUser.email_confirmed_at)
          : null,
        lastLoginAt: new Date(),
      },
    });
    return;
  }

  const email = authUser.email ?? `${authUser.id}@no-email.olat5`;
  const orgBase = slugify(fullName ?? email.split("@")[0] ?? "team") || "team";
  let slug = `${orgBase}-${authUser.id.slice(0, 6)}`;

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: authUser.id,
        email,
        emailVerified: authUser.email_confirmed_at
          ? new Date(authUser.email_confirmed_at)
          : null,
        lastLoginAt: new Date(),
        profile: {
          create: { fullName, avatarUrl },
        },
      },
    });

    const org = await tx.organization.create({
      data: {
        name: fullName ? `${fullName}'s Workspace` : "My Workspace",
        slug,
        ownerId: authUser.id,
        billingEmail: email,
        subscription: {
          create: { plan: "FREE", status: "ACTIVE", interval: "MONTHLY", seats: 1 },
        },
      },
    });

    await tx.membership.create({
      data: {
        organizationId: org.id,
        userId: authUser.id,
        role: "OWNER",
        acceptedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        actorId: authUser.id,
        action: "user.signup",
        target: authUser.id,
      },
    });
  });
}

// Full auth context with the user's primary organization. Throws redirect when
// unauthenticated — used by protected loaders.
export async function requireAuth(): Promise<AuthContext> {
  const authUser = await getSessionUser();
  if (!authUser) {
    throw redirect({ to: "/login" });
  }

  await ensureUserRecord(authUser);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: authUser.id },
    select: {
      id: true,
      email: true,
      profile: { select: { fullName: true, avatarUrl: true } },
    },
  });

  const membership = await prisma.membership.findFirst({
    where: { userId: authUser.id, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return {
    userId: user.id,
    email: user.email,
    user,
    organization: membership
      ? {
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          role: membership.role,
        }
      : null,
  };
}

// Non-throwing variant for optional auth (e.g. marketing pages).
export async function getOptionalAuth(): Promise<AuthContext | null> {
  const authUser = await getSessionUser();
  if (!authUser) return null;
  return requireAuth();
}
