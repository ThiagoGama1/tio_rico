import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  __tioRicoPrisma?: PrismaClient;
  __tioRicoPgPool?: Pool;
};

function resolveDatabaseUrl(): string | undefined {
  const pooled = process.env.DATABASE_URL_POOLED?.trim();
  if (pooled) return pooled;
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;
  return undefined;
}

/**
 * Returns true when a PostgreSQL connection string (`DATABASE_URL_POOLED` or
 * `DATABASE_URL`) is present in the environment. Safe to call during build.
 */
export function isDatabaseConfigured(): boolean {
  return resolveDatabaseUrl() !== undefined;
}

/**
 * Lazily initializes and returns the singleton PrismaClient backed by a `pg.Pool`
 * attached to the Vercel Functions lifecycle via `attachDatabasePool`.
 *
 * Importing this module never connects or throws at build time when
 * `DATABASE_URL` is undefined; an explicit error is thrown only when
 * `getPrisma()` is actually invoked without a configured connection string.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.__tioRicoPrisma) {
    return globalForPrisma.__tioRicoPrisma;
  }

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL (ou DATABASE_URL_POOLED) não está configurada. Defina a variável de ambiente para acessar o banco de dados PostgreSQL.",
    );
  }

  const pool =
    globalForPrisma.__tioRicoPgPool ??
    (() => {
      const nextPool = new Pool({ connectionString });
      attachDatabasePool(nextPool);
      return nextPool;
    })();

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  globalForPrisma.__tioRicoPgPool = pool;
  globalForPrisma.__tioRicoPrisma = client;

  return client;
}

export type { PrismaClient };
