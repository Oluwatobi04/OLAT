import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";
import { slugify } from "~/lib/utils";

// ── Aggregate data for the dashboard home ────────────────────────────────────
export const getDashboardDataFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = await requireAuth();
    const orgId = auth.organization?.id;
    if (!orgId) {
      return {
        auth,
        stats: { sessions: 0, minutes: 0, tokens: 0, members: 0 },
        recentSessions: [],
        plan: "FREE" as const,
      };
    }

    const [sessionCount, memberCount, recentSessions, usage, subscription] =
      await Promise.all([
        prisma.session.count({ where: { organizationId: orgId } }),
        prisma.membership.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
        prisma.session.findMany({
          where: { organizationId: orgId },
          orderBy: { startedAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            mode: true,
            status: true,
            startedAt: true,
            durationSec: true,
          },
        }),
        prisma.aiUsage.groupBy({
          by: ["metric"],
          where: { organizationId: orgId },
          _sum: { quantity: true },
        }),
        prisma.subscription.findUnique({ where: { organizationId: orgId } }),
      ]);

    const minutes =
      usage.find((u) => u.metric === "TRANSCRIPTION_MINUTES")?._sum.quantity ?? 0;
    const tokens = usage.find((u) => u.metric === "AI_TOKENS")?._sum.quantity ?? 0;

    return {
      auth,
      stats: { sessions: sessionCount, minutes, tokens, members: memberCount },
      recentSessions,
      plan: subscription?.plan ?? "FREE",
    };
  },
);

// ── Profile ──────────────────────────────────────────────────────────────────
export const updateProfileFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        fullName: z.string().max(120).optional(),
        jobTitle: z.string().max(120).optional(),
        company: z.string().max(120).optional(),
        timezone: z.string().max(64).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    await prisma.profile.update({
      where: { userId: auth.userId },
      data: {
        fullName: data.fullName,
        jobTitle: data.jobTitle,
        company: data.company,
        timezone: data.timezone,
      },
    });
    return { ok: true as const };
  });

// ── Organization ───────────────────────────────────────────────────────────
export const getOrganizationFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = await requireAuth();
    if (!auth.organization) return null;
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: auth.organization.id },
      include: {
        subscription: true,
        teams: { orderBy: { createdAt: "asc" } },
        _count: { select: { memberships: true } },
      },
    });
    return { org, role: auth.organization.role };
  },
);

export const updateOrganizationFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        billingEmail: z.string().email().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    await prisma.organization.update({
      where: { id: auth.organization.id },
      data: { name: data.name, billingEmail: data.billingEmail },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: auth.organization.id,
        actorId: auth.userId,
        action: "organization.updated",
        target: auth.organization.id,
      },
    });
    return { ok: true as const };
  });

// ── Teams & members ──────────────────────────────────────────────────────────
export const getTeamDataFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  if (!auth.organization) return { members: [], teams: [], role: "MEMBER" };
  const [members, teams] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: auth.organization.id },
      include: {
        user: { select: { email: true, profile: { select: { fullName: true, avatarUrl: true } } } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.team.findMany({
      where: { organizationId: auth.organization.id },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { members, teams, role: auth.organization.role };
});

export const createTeamFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ name: z.string().min(1).max(80), description: z.string().max(280).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN", "MANAGER"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    const existing = await prisma.team.findUnique({
      where: { organizationId_name: { organizationId: auth.organization.id, name: data.name } },
    });
    if (existing) return { ok: false as const, error: "A team with that name exists" };
    await prisma.team.create({
      data: {
        organizationId: auth.organization.id,
        name: data.name,
        description: data.description,
      },
    });
    return { ok: true as const };
  });

export const inviteMemberFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["ADMIN", "MANAGER", "MEMBER", "BILLING"]).default("MEMBER"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    if (!["OWNER", "ADMIN"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }

    // If the invitee already has an account, attach them directly; otherwise
    // create a pending invited membership keyed by email + token.
    const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
    const token = crypto.randomUUID();

    if (existingUser) {
      const dupe = await prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: auth.organization.id,
            userId: existingUser.id,
          },
        },
      });
      if (dupe) return { ok: false as const, error: "Already a member" };
      await prisma.membership.create({
        data: {
          organizationId: auth.organization.id,
          userId: existingUser.id,
          role: data.role,
          status: "INVITED",
          invitedEmail: data.email,
          inviteToken: token,
          invitedAt: new Date(),
        },
      });
    } else {
      // Placeholder membership keyed only by email until they sign up.
      await prisma.auditLog.create({
        data: {
          organizationId: auth.organization.id,
          actorId: auth.userId,
          action: "member.invited.pending",
          target: data.email,
          metadata: { role: data.role, token },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: auth.organization.id,
        actorId: auth.userId,
        action: "member.invited",
        target: data.email,
      },
    });
    return { ok: true as const };
  });

export const updateMemberRoleFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        membershipId: z.string().uuid(),
        role: z.enum(["ADMIN", "MANAGER", "MEMBER", "BILLING"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization || !["OWNER", "ADMIN"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    const membership = await prisma.membership.findUnique({ where: { id: data.membershipId } });
    if (!membership || membership.organizationId !== auth.organization.id) {
      return { ok: false as const, error: "Member not found" };
    }
    if (membership.role === "OWNER") {
      return { ok: false as const, error: "Cannot change the owner's role" };
    }
    await prisma.membership.update({ where: { id: data.membershipId }, data: { role: data.role } });
    return { ok: true as const };
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ membershipId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization || !["OWNER", "ADMIN"].includes(auth.organization.role)) {
      return { ok: false as const, error: "Insufficient permissions" };
    }
    const membership = await prisma.membership.findUnique({ where: { id: data.membershipId } });
    if (!membership || membership.organizationId !== auth.organization.id) {
      return { ok: false as const, error: "Member not found" };
    }
    if (membership.role === "OWNER") {
      return { ok: false as const, error: "Cannot remove the owner" };
    }
    await prisma.membership.delete({ where: { id: data.membershipId } });
    return { ok: true as const };
  });
