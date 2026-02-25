import path from "path";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 6's generated client resolves relative `file:` paths relative to its
// own directory (src/generated/prisma/), not the process CWD. Convert to
// absolute here so the path is unambiguous regardless of how Prisma resolves it.
if (process.env.DATABASE_URL?.startsWith("file:.")) {
  const relative = process.env.DATABASE_URL.slice("file:".length);
  process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), relative)}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
