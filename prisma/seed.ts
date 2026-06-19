import { PrismaClient, Role, PlanTier, BillingInterval, SubscriptionStatus, SessionMode, SessionStatus, UsageMetric } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding OLat5 database...");

  // Deterministic demo user id (matches a Supabase auth user in real setups).
  const demoUserId = "00000000-0000-0000-0000-000000000001";
  const demoEmail = "demo@olat5.com";

  const user = await prisma.user.upsert({
    where: { id: demoUserId },
    update: { email: demoEmail, emailVerified: new Date() },
    create: {
      id: demoUserId,
      email: demoEmail,
      emailVerified: new Date(),
      lastLoginAt: new Date(),
      profile: {
        create: {
          fullName: "Demo User",
          jobTitle: "Product Manager",
          company: "OLat5",
          timezone: "America/New_York",
          onboardedAt: new Date(),
        },
      },
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo-org",
      ownerId: user.id,
      billingEmail: demoEmail,
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: Role.OWNER },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: Role.OWNER,
      acceptedAt: new Date(),
    },
  });

  const team = await prisma.team.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Engineering" } },
    update: {},
    create: {
      organizationId: org.id,
      name: "Engineering",
      description: "Core product engineering team",
    },
  });

  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      plan: PlanTier.FREE,
      interval: BillingInterval.MONTHLY,
      status: SubscriptionStatus.ACTIVE,
      seats: 1,
    },
  });

  // Sample completed session with transcript + usage.
  const sessionId = randomUUID();
  await prisma.session.create({
    data: {
      id: sessionId,
      organizationId: org.id,
      userId: user.id,
      title: "Weekly Product Sync",
      mode: SessionMode.MEETING,
      platform: "ZOOM",
      status: SessionStatus.COMPLETED,
      startedAt: new Date(Date.now() - 3600_000),
      endedAt: new Date(Date.now() - 1800_000),
      durationSec: 1800,
      summary: "Discussed Q3 roadmap, agreed on billing milestone, assigned action items.",
      transcripts: {
        create: [
          { speaker: "Alice", speakerRole: "OTHER", text: "Let's review the roadmap.", startMs: 0, endMs: 2400, confidence: 0.97 },
          { speaker: "You", speakerRole: "SELF", text: "Billing ships first, then the desktop app.", startMs: 2500, endMs: 6200, confidence: 0.95 },
        ],
      },
      aiUsage: {
        create: [
          { organizationId: org.id, userId: user.id, metric: UsageMetric.AI_TOKENS, model: "gpt-4o-mini", promptTokens: 1200, completionTokens: 320, quantity: 1520 },
          { organizationId: org.id, userId: user.id, metric: UsageMetric.TRANSCRIPTION_MINUTES, quantity: 30 },
        ],
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      actorId: user.id,
      action: "seed.bootstrap",
      target: org.id,
      metadata: { note: "Initial seed data created" },
    },
  });

  console.log("Seed complete:", { user: user.email, org: org.slug, team: team.name });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
