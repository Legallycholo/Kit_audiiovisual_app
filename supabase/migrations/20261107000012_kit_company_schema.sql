-- KIT company server schema (moves the former SQLite file to Postgres).
--
-- One canonical file. It is applied by the owner to the hosted Supabase project
-- and read by the PGlite adapter (server/db/pglite.ts) for local development and
-- tests, so every role-specific statement is guarded and only runs on Supabase.
--
-- Everything lives in the private `kit` schema, which is NOT exposed through the
-- Supabase Data API: these tables hold password hashes and session hashes, and the
-- portal project already owns public.sessions and public.audit_log.
--
-- Deliberate differences from the SQLite schema (each keeps behavior identical):
--   * audit.seq / workspace_recovery.seq replace SQLite's implicit rowid ordering.
--   * users.email is unique on lower(email) (replaces COLLATE NOCASE); queries
--     compare lower(email) = lower(?).
--   * Epoch-millisecond columns are BIGINT (the driver returns them as numbers).
--   * owner/active/revoked stay INTEGER 0/1 so row types do not change.
--   * JSON payloads stay TEXT, not jsonb: recovery points verify a SHA-256 of the
--     exact stored string, which jsonb would rewrite.

CREATE SCHEMA IF NOT EXISTS kit;

CREATE TABLE IF NOT EXISTS kit.workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kit.users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  owner INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  password_hash TEXT NOT NULL,
  event_ids TEXT NOT NULL DEFAULT '[]',
  client_id TEXT,
  shared_proposals TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON kit.users (lower(email));

CREATE TABLE IF NOT EXISTS kit.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES kit.users (id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON kit.sessions (user_id);

CREATE TABLE IF NOT EXISTS kit.audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  event_id TEXT,
  created_at TEXT NOT NULL,
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS audit_time ON kit.audit (created_at);
CREATE INDEX IF NOT EXISTS audit_seq ON kit.audit (seq);

CREATE TABLE IF NOT EXISTS kit.login_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS kit.workspace_recovery (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  previous_revision INTEGER NOT NULL,
  restored_revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  payload_checksum TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS workspace_recovery_time ON kit.workspace_recovery (created_at);
CREATE INDEX IF NOT EXISTS workspace_recovery_seq ON kit.workspace_recovery (seq);

CREATE TABLE IF NOT EXISTS kit.search_tenant (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS kit.search_devices (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  expires BIGINT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kit.search_sources (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  updated TEXT NOT NULL,
  policy TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS kit.search_usage (
  month TEXT NOT NULL,
  user_id TEXT NOT NULL,
  cents INTEGER NOT NULL,
  PRIMARY KEY (month, user_id)
);

CREATE TABLE IF NOT EXISTS kit.kit_threads (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS kit_owner ON kit.kit_threads (owner, updated);

-- Defense in depth: row level security on, with no policy for the public API roles.
ALTER TABLE kit.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.workspace_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.search_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.search_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.search_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.search_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.kit_threads ENABLE ROW LEVEL SECURITY;

-- Supabase only (skipped on local PGlite, where these roles do not exist).
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA kit FROM anon, authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA kit FROM anon, authenticated;

    -- The company server connects as kit_server. It has no password here: the
    -- owner sets one (see docs/DEPLOY_VERCEL.md), so no secret is ever committed.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kit_server') THEN
      CREATE ROLE kit_server NOLOGIN;
    END IF;
    GRANT USAGE ON SCHEMA kit TO kit_server;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kit TO kit_server;
    ALTER ROLE kit_server SET search_path = kit;

    FOREACH t IN ARRAY ARRAY[
      'workspace', 'users', 'sessions', 'audit', 'login_attempts',
      'workspace_recovery', 'search_tenant', 'search_devices',
      'search_sources', 'search_usage', 'kit_threads'
    ]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS kit_server_all ON kit.%I', t);
      EXECUTE format(
        'CREATE POLICY kit_server_all ON kit.%I FOR ALL TO kit_server USING (true) WITH CHECK (true)',
        t
      );
    END LOOP;
  END IF;
END
$$;
