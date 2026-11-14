-- Idempotent reapplication of upload-intent and creator-session definitions.
-- Kept to mirror the applied Supabase migration history; the schema changes use
-- IF NOT EXISTS and CREATE OR REPLACE in the preceding migration.
select 1;
