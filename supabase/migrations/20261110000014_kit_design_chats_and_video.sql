-- KIT Design: several designs ("chats") per event, plus videos.
-- Applied after 20261109000013_kit_design.sql. Idempotent: PGlite re-runs every
-- migration file each time a local database directory opens.
--
-- Before: one design per event (design_projects.event_id was the key).
-- After:  design_projects.id is the key and an event can have many designs. The
--         other design tables point at a design with design_id. Existing rows
--         keep working: their design id is the old event id.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'kit' AND table_name = 'design_projects' AND column_name = 'id'
  ) THEN
    ALTER TABLE kit.design_projects ADD COLUMN id TEXT;
    ALTER TABLE kit.design_projects ADD COLUMN title TEXT NOT NULL DEFAULT '';
    ALTER TABLE kit.design_projects ADD COLUMN created_at TEXT;
    ALTER TABLE kit.design_projects ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
    UPDATE kit.design_projects
      SET id = event_id, created_at = updated_at, title = left(brief, 60);
    ALTER TABLE kit.design_projects ALTER COLUMN id SET NOT NULL;
    ALTER TABLE kit.design_projects ALTER COLUMN created_at SET NOT NULL;
    ALTER TABLE kit.design_projects DROP CONSTRAINT design_projects_pkey;
    ALTER TABLE kit.design_projects ADD PRIMARY KEY (id);

    ALTER TABLE kit.design_images ADD COLUMN design_id TEXT;
    UPDATE kit.design_images SET design_id = event_id;
    ALTER TABLE kit.design_images ALTER COLUMN design_id SET NOT NULL;

    ALTER TABLE kit.design_messages ADD COLUMN design_id TEXT;
    UPDATE kit.design_messages SET design_id = event_id;
    ALTER TABLE kit.design_messages ALTER COLUMN design_id SET NOT NULL;

    ALTER TABLE kit.design_versions ADD COLUMN design_id TEXT;
    UPDATE kit.design_versions SET design_id = event_id;
    ALTER TABLE kit.design_versions ALTER COLUMN design_id SET NOT NULL;
    ALTER TABLE kit.design_versions DROP CONSTRAINT design_versions_event_id_number_key;
    ALTER TABLE kit.design_versions ADD CONSTRAINT design_versions_design_number_key UNIQUE (design_id, number);

    ALTER TABLE kit.design_renders ADD COLUMN design_id TEXT;
    UPDATE kit.design_renders SET design_id = event_id;
    ALTER TABLE kit.design_renders ALTER COLUMN design_id SET NOT NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS design_projects_event ON kit.design_projects (event_id, updated_at);
CREATE INDEX IF NOT EXISTS design_images_design ON kit.design_images (design_id, seq);
CREATE INDEX IF NOT EXISTS design_messages_design ON kit.design_messages (design_id, seq);
CREATE INDEX IF NOT EXISTS design_versions_design ON kit.design_versions (design_id, number);
CREATE INDEX IF NOT EXISTS design_renders_design ON kit.design_renders (design_id);

-- One video per render at most; the file is a short mp4 of a camera move over the 3D-looking render.
CREATE TABLE IF NOT EXISTS kit.design_videos (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES kit.design_versions (id) ON DELETE CASCADE,
  render_id TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS design_videos_design ON kit.design_videos (design_id);
CREATE INDEX IF NOT EXISTS design_videos_usage ON kit.design_videos (provider, created_at);

ALTER TABLE kit.design_videos ENABLE ROW LEVEL SECURITY;

-- Supabase only (skipped on local PGlite).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kit_server') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA kit TO kit_server;
    DROP POLICY IF EXISTS kit_server_all ON kit.design_videos;
    CREATE POLICY kit_server_all ON kit.design_videos FOR ALL TO kit_server USING (true) WITH CHECK (true);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA kit FROM anon, authenticated;
  END IF;
  -- The private bucket now also holds mp4 videos (up to 50 MB each).
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    UPDATE storage.buckets
      SET file_size_limit = 52428800,
          allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
      WHERE id = 'kit-design';
  END IF;
END
$$;
