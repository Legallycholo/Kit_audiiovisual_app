-- KIT Design (Diseño): room images in, realistic event renders out.
-- Plan: docs/kit_design_AI.md. Applied after 20261107000012_kit_company_schema.sql;
-- the PGlite adapter (server/db/pglite.ts) reads both files, so local
-- development and tests use exactly this schema. Idempotent.
--
-- Image bytes live in the private Supabase Storage bucket `kit-design` when the
-- server has SUPABASE_SECRET_KEY, and otherwise in kit.design_files (local
-- development, tests, or a deployment without storage configured).

CREATE TABLE IF NOT EXISTS kit.design_projects (
  event_id TEXT PRIMARY KEY,
  brief TEXT NOT NULL DEFAULT '',
  current_version_id TEXT,
  pending_version_id TEXT,
  -- JSON {id, kind, request, startedAt} while KIT Design is working; NULL otherwise.
  job TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kit.design_images (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS design_images_event ON kit.design_images (event_id, seq);

-- Versions are append-only; a pending version is discarded by deleting it.
CREATE TABLE IF NOT EXISTS kit.design_versions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  request TEXT NOT NULL,
  spec TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (event_id, number)
);

CREATE TABLE IF NOT EXISTS kit.design_renders (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES kit.design_versions (id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  view_id TEXT NOT NULL,
  source_image_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS design_renders_version ON kit.design_renders (version_id, position);
-- Monthly render allowance counts live renders by creation time.
CREATE INDEX IF NOT EXISTS design_renders_usage ON kit.design_renders (provider, created_at);

CREATE TABLE IF NOT EXISTS kit.design_messages (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seq BIGINT GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX IF NOT EXISTS design_messages_event ON kit.design_messages (event_id, seq);

CREATE TABLE IF NOT EXISTS kit.design_files (
  path TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL
);

ALTER TABLE kit.design_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.design_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.design_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.design_renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.design_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit.design_files ENABLE ROW LEVEL SECURITY;

-- Supabase only (skipped on local PGlite, where these roles and storage do not exist).
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kit_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kit TO kit_server;
    FOREACH t IN ARRAY ARRAY[
      'design_projects', 'design_images', 'design_versions',
      'design_renders', 'design_messages', 'design_files'
    ]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS kit_server_all ON kit.%I', t);
      EXECUTE format(
        'CREATE POLICY kit_server_all ON kit.%I FOR ALL TO kit_server USING (true) WITH CHECK (true)',
        t
      );
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA kit FROM anon, authenticated;
  END IF;
  -- Private bucket, no policies: only the server's secret key can read or write it.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('kit-design', 'kit-design', false, 26214400,
            ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;
