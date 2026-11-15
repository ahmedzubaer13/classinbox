-- A claimed expired session stops accepting new uploads immediately.
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
         cleanup_retry_after = now() + interval '5 minutes',
         is_active = false,
         closed_at = coalesce(s.closed_at, now())
    from candidates c
   where s.id = c.id
  returning s.id;
$function$;

revoke all on function public.classinbox_claim_expired_sessions(integer) from public, anon, authenticated;
grant execute on function public.classinbox_claim_expired_sessions(integer) to service_role;
