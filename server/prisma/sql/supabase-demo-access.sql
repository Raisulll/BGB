-- BIRDS TEC demo on Supabase (DOUBT-010): database privileges.
-- Run in the Supabase SQL editor (as postgres) AFTER `prisma migrate deploy` and `prisma db seed`,
-- and again after any later migration. Idempotent.
-- Guide: server/docs/installation-guide/demo-hosting-render-supabase.md
--
-- Tables are owned by postgres (migrations run as postgres). The app connects as "birds", which
-- gets data access only: it can't alter tables or disable the audit-log / timeline triggers
-- (specs #24, #25), because only the table owner or a superuser can do that.

-- 1. Supabase grants its public Data API roles full access to everything in "public" by default.
--    BIRDS never uses the Data API, so take that access away (the Data API is also switched off
--    in the dashboard; this is the second lock).
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- 2. The application role: read/write data, nothing else
GRANT USAGE ON SCHEMA public TO birds;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO birds;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO birds;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO birds;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO birds;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO birds;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO birds;
-- The migration history is not the app's business
REVOKE ALL ON TABLE _prisma_migrations FROM birds;

-- 3. Check: expect no rows (nothing in "public" reachable by the Data API roles)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
