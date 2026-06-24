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

// ── Premium dashboard home — all real data, no placeholders ──────────────────
export const getHomeFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const orgId = auth.organization?.id ?? null;

  // All independent reads run in parallel (the 3 counts previously ran
  // sequentially inside the return object — 3 extra serial round-trips).
  const [
    sessions,
    resumes,
    documents,
    balance,
    activity,
    sessionCount,
    resumeCount,
    documentCount,
  ] = await Promise.all([
    prisma.session.findMany({
      where: { userId: auth.userId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { id: true, title: true, mode: true, platform: true, status: true, startedAt: true, durationSec: true },
    }),
    prisma.resumeUpload.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, fileName: true, resumeScore: true, atsScore: true, createdAt: true },
    }),
    prisma.jobDescription.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, company: true, createdAt: true },
    }),
    prisma.creditBalance.findUnique({ where: { userId: auth.userId } }),
    prisma.creditTransaction.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, actionType: true, creditsUsed: true, direction: true, remainingBalance: true, createdAt: true },
    }),
    prisma.session.count({ where: { userId: auth.userId } }),
    prisma.resumeUpload.count({ where: { userId: auth.userId } }),
    prisma.jobDescription.count({ where: { userId: auth.userId } }),
  ]);

  return {
    user: auth.user,
    counts: {
      sessions: sessionCount,
      resumes: resumeCount,
      documents: documentCount,
    },
    sessions,
    resumes,
    documents,
    activity,
    credits: {
      remaining: balance?.currentBalance ?? 0,
      allocation: balance?.monthlyAllocation ?? 0,
      used: Math.max(0, (balance?.monthlyAllocation ?? 0) - (balance?.currentBalance ?? 0)),
      plan: balance?.planType ?? "FREE",
    },
    orgId,
  };
});

// ── Profile ──────────────────────────────────────────────────────────────────
// Returns ALL editable profile fields so the settings form can render saved
// values (requireAuth's AuthContext only carries fullName/avatarUrl).
export const getProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const profile = await prisma.profile.findUnique({
    where: { userId: auth.userId },
    select: { fullName: true, jobTitle: true, company: true, timezone: true },
  });
  return {
    email: auth.email,
    fullName: profile?.fullName ?? "",
    jobTitle: profile?.jobTitle ?? "",
    company: profile?.company ?? "",
    timezone: profile?.timezone ?? "",
  };
});

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
    const clean = (v?: string) => {
      const t = (v ?? "").trim();
      return t.length ? t : null;
    };
    await prisma.profile.update({
      where: { userId: auth.userId },
      data: {
        fullName: clean(data.fullName),
        jobTitle: clean(data.jobTitle),
        company: clean(data.company),
        timezone: clean(data.timezone) ?? "UTC",
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
