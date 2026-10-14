import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * On Vercel every server instance opens its own database connections.
 * Supabase's session pooler (port 5432) only allows a small number of
 * clients, so a handful of busy instances can use them all up and every
 * page starts failing. At runtime we therefore connect through Supabase's
 * transaction pooler (port 6543, same host/user/password) with a small
 * per-instance pool (the transaction pooler multiplexes many clients, so
 * this no longer exhausts Supabase's limit).
 * The build step's `prisma db push` still uses DATABASE_URL as-is.
 */
function runtimeDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("pooler.supabase.com") && url.port === "5432") {
      url.port = "6543";
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
    return url.toString();
  } catch {
    return raw;
  }
}

// Standard Next.js dev-mode singleton, so hot-reload doesn't open a new
// connection pool on every save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const base = globalForPrisma.prisma ?? new PrismaClient({ datasources: { db: { url: runtimeDatabaseUrl() } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

/**
 * All-or-nothing: inside atomic(), every `prisma` call anywhere in the code
 * runs in one database transaction - if anything fails (or it runs out of
 * time) nothing is saved and the herd is exactly as it was.
 */
const txStore = new AsyncLocalStorage<Prisma.TransactionClient>();

export const prisma = new Proxy(base, {
  get(target, prop) {
    const tx = txStore.getStore();
    if (tx) {
      // A batch inside the transaction just runs its steps in order - it's already all-or-nothing.
      if (prop === "$transaction") {
        return async (arg: unknown) => {
          if (typeof arg === "function") return (arg as (t: Prisma.TransactionClient) => unknown)(tx);
          const out: unknown[] = [];
          for (const op of arg as Promise<unknown>[]) out.push(await op);
          return out;
        };
      }
      const v = (tx as unknown as Record<string | symbol, unknown>)[prop];
      if (v !== undefined) return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(tx) : v;
    }
    const v = Reflect.get(target, prop, target);
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  },
}) as PrismaClient;

/** Longest a season step may run before it's called off (and rolled back). */
export const ATOMIC_TIMEOUT_MS = Number(process.env.ATOMIC_TIMEOUT_MS || 280_000);

/** True inside atomic() - bulk rewrites are only safe there. */
export const inTransaction = () => !!txStore.getStore();

export async function atomic<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  return base.$transaction((tx) => txStore.run(tx, fn), { maxWait: 10_000, timeout: ATOMIC_TIMEOUT_MS });
}
