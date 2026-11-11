// Lock Supabase's public web door (its Data API) on every RecipLive table - run by the build after `prisma db push`, on
// each site's own database (Carter, 2026-11-10: Supabase "Table publicly accessible / rls_disabled_in_public").
//
// RecipLive never uses that door: every page reaches the database through the server's own login (DATABASE_URL, Prisma),
// the owner of the tables. So:
//   1. Row-Level Security is turned on with no rules - nothing gets through the web door. A table's owner is not held by
//      it, so the app reads and writes as before. Only tables this login owns are touched; any other is listed, not changed.
//   2. The web door's roles (anon, authenticated) lose their grants on RecipLive's own tables, when those roles exist.
// Each table on its own: one RecipLive does not own is never touched (a REVOKE on it would undo the whole step).
// Never deletes or changes a row. Runs every build, so a table added later is locked too. A failure is printed loudly
// and the build goes on - the site must never go down over this.
const { PrismaClient } = require("@prisma/client");

const LOCK = `
DO $$
DECLARE r record; skipped text := ''; doors text := '';
BEGIN
  -- The web door's roles, when this database has them (Supabase does).
  SELECT string_agg(quote_ident(rolname), ', ') INTO doors FROM pg_roles WHERE rolname IN ('anon', 'authenticated');
  FOR r IN
    SELECT c.relname, c.relkind, c.relowner, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
  LOOP
    IF NOT pg_has_role(current_user, r.relowner, 'USAGE') THEN
      IF r.relkind <> 'S' THEN skipped := skipped || ' ' || r.relname; END IF;
      CONTINUE; -- not ours: never touched
    END IF;
    IF r.relkind <> 'S' AND NOT r.relrowsecurity THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    END IF;
    IF doors IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON %s public.%I FROM %s', CASE WHEN r.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, r.relname, doors);
    END IF;
  END LOOP;
  IF skipped <> '' THEN RAISE NOTICE 'lock-api: not owned by this login, left as they are:%', skipped; END IF;
END $$;`;

const CHECK = `
SELECT
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')) AS tables,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity) AS open,
  (SELECT bool_and(pg_has_role(current_user, c.relowner, 'USAGE') OR r.rolbypassrls OR r.rolsuper)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, pg_roles r
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND r.rolname = current_user) AS appReaches`;

async function main() {
  if (!process.env.DATABASE_URL) return console.log("lock-api: no DATABASE_URL - skipped");
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(LOCK);
    const [c] = await db.$queryRawUnsafe(CHECK);
    console.log(`lock-api: ${c.tables} tables, ${c.open} still open to the web door; the app still reaches every table: ${c.appreaches ?? c.appReaches}`);
  } catch (e) {
    console.error("lock-api: FAILED - the web door was not locked this build:", e && e.message ? e.message : e);
  } finally {
    await db.$disconnect();
  }
}
main();
