-- The cleanup worker is deployed as a Supabase Edge Function:
-- supabase/functions/classinbox-cleanup/index.ts
-- It verifies the custom x-classinbox-cron-secret header against
-- public.classinbox_validate_cleanup_secret(), deletes tracked Storage objects,
-- and only removes a session row after Storage removal succeeds.
--
-- Set the Vault secret and schedule the HTTP invocation as described in README.md.
select 1;
