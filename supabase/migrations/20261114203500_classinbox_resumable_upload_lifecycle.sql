-- Mark resumable Storage intents so cleanup retains their session tombstones
-- for the full validity window of Supabase TUS upload URLs.
alter table public.upload_intents
  add column if not exists is_resumable boolean not null default false;

create index if not exists upload_intents_resumable_idx
  on public.upload_intents (session_id)
  where is_resumable = true;

create or replace function public.classinbox_begin_upload(
  p_public_token text,
  p_storage_path text,
  p_is_resumable boolean
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session
    from public.sessions
   where public_token = p_public_token
   for update;

  if not found
     or v_session.is_active is distinct from true
     or v_session.cleanup_started_at is not null
     or v_session.last_activity_at <= now() - interval '30 minutes' then
    raise exception 'SESSION_UNAVAILABLE';
  end if;

  if p_storage_path is null
     or left(p_storage_path, length(v_session.id::text) + 1) <> (v_session.id::text || '/') then
    raise exception 'INVALID_UPLOAD_PATH';
  end if;

  update public.sessions
     set last_activity_at = now()
   where id = v_session.id;

  insert into public.upload_intents (
    session_id, storage_path, is_resumable, status, last_heartbeat_at
  )
  values (
    v_session.id, p_storage_path, coalesce(p_is_resumable, false), 'started', now()
  );

  return v_session.id;
end;
$function$;

revoke all on function public.classinbox_begin_upload(text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.classinbox_begin_upload(text,text,boolean)
  to service_role;
