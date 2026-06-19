import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "~/lib/db.server";
import { requireAuth } from "~/lib/auth.server";

export const listSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  if (!auth.organization) return [];
  return prisma.session.findMany({
    where: { organizationId: auth.organization.id },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      mode: true,
      platform: true,
      status: true,
      startedAt: true,
      durationSec: true,
    },
  });
});

export const createSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        title: z.string().max(200).optional(),
        mode: z.enum(["INTERVIEW", "MEETING", "COACHING", "SALES", "GENERIC"]),
        platform: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };

    const session = await prisma.session.create({
      data: {
        organizationId: auth.organization.id,
        userId: auth.userId,
        title: data.title ?? null,
        mode: data.mode,
        platform: data.platform ?? null,
        status: "LIVE",
      },
      select: { id: true },
    });

    await prisma.aiUsage.create({
      data: {
        organizationId: auth.organization.id,
        userId: auth.userId,
        sessionId: session.id,
        metric: "SESSION_COUNT",
        quantity: 1,
      },
    });

    return { ok: true as const, id: session.id };
  });

export const deleteSessionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.organization) return { ok: false as const, error: "No organization" };
    const session = await prisma.session.findUnique({ where: { id: data.id } });
    if (!session || session.organizationId !== auth.organization.id) {
      return { ok: false as const, error: "Not found" };
    }
    await prisma.session.delete({ where: { id: data.id } });
    return { ok: true as const };
  });
