import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const max = parseInt(process.env.DB_POOL_MAX || "", 10);
  // DB_POOL_MAX=1 is only for the local `prisma dev` embedded server, which can't handle concurrent queries. Never set it in production.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, ...(Number.isFinite(max) && max > 0 ? { max } : {}) });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
