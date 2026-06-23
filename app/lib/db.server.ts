import { PrismaClient } from "@prisma/client";

// Production-safe singleton. Vercel re-evaluates the module on every cold start
// and reuses it while warm, so we MUST cache on globalThis in ALL environments —
// otherwise each serverless invocation opens a new pool and exhausts Supabase
// (EMAXCONNS / "max clients reached"). Pair this with the TRANSACTION pooler
// (port 6543) + `?pgbouncer=true&connection_limit=1` in DATABASE_URL.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Cache in every environment (the previous code only cached outside production,
// which is exactly what caused connection exhaustion on Vercel).
globalForPrisma.prisma = prisma;
