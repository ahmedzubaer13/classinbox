-- Add retry state and a private credential verifier for the cleanup worker.
alter table public.sessions
  add column if not exists cleanup_retry_after timestamptz,
  add column if not exists cleanup_last_error text,
  add column if not exists cleanup_attempts integer not null default 0;

create schema if not exists classinbox_private;

create table if not exists classinbox_private.cleanup_credentials (
  id boolean primary key default true check (id),
  secret_hash text not null
);

revoke all on schema classinbox_private from public, anon, authenticated;
revoke all on table classinbox_private.cleanup_credentials from public, anon, authenticated;
grant usage on schema classinbox_private to service_role;

create or replace function public.classinbox_validate_cleanup_secret(p_candidate text)
returns boolean
language sql
security definer
set search_path = pg_catalog, classinbox_private, extensions
as $function$
  select coalesce(
    (select extensions.crypt(p_candidate, secret_hash) = secret_hash
       from classinbox_private.cleanup_credentials
      where id = true),
    false
  );
$function$;

revoke all on function public.classinbox_validate_cleanup_secret(text) from public, anon, authenticated;
grant execute on function public.classinbox_validate_cleanup_secret(text) to service_role;

create or replace function public.classinbox_claim_expired_sessions(p_batch integer default 10)
returns table(session_id uuid)
language sql
security definer
set search_path = pg_catalog, public
as $function$
  with candidates as (
    select s.id
      from public.sessions s
     where (
       (s.cleanup_started_at is null
        and s.last_activity_at <= now() - interval '30 minutes')
       or
       (s.cleanup_started_at is not null
        and coalesce(s.cleanup_retry_after, '-infinity'::timestamptz) <= now())
     )
     order by s.last_activity_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_batch, 10), 50))
  )
  update public.sessions s
     set cleanup_started_at = coalesce(s.cleanup_started_at, now()),
         cleanup_retry_after = now() + interval '5 minutes'
    from candidates c
   where s.id = c.id
  returning s.id;
$function$;

revoke all on function public.classinbox_claim_expired_sessions(integer) from public, anon, authenticated;
grant execute on function public.classinbox_claim_expired_sessions(integer) to service_role;
