-- Creator ownership and upload intents ensure all Storage paths are tracked.
alter table public.sessions
  add column if not exists owner_key_hash text,
  add column if not exists cleanup_completed_at timestamptz;

create table if not exists public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  storage_path text not null unique,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists upload_intents_session_idx
  on public.upload_intents (session_id, created_at);
create index if not exists upload_intents_active_heartbeat_idx
  on public.upload_intents (session_id, last_heartbeat_at)
  where status = 'started';

alter table public.upload_intents enable row level security;
revoke all on public.upload_intents from anon, authenticated;
grant all on public.upload_intents to service_role;

create or replace function public.classinbox_begin_upload(
  p_public_token text, p_storage_path text
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_session public.sessions%rowtype;
begin
  select * into v_session
    from public.sessions
   where public_token = p_public_token
   for update;

  if not found or v_session.is_active is distinct from true
     or v_session.cleanup_started_at is not null
     or v_session.last_activity_at <= now() - interval '30 minutes' then
    raise exception 'SESSION_UNAVAILABLE';
  end if;

  if p_storage_path is null
     or left(p_storage_path, length(v_session.id::text) + 1) <> (v_session.id::text || '/') then
    raise exception 'INVALID_UPLOAD_PATH';
  end if;

  update public.sessions set last_activity_at = now() where id = v_session.id;
  insert into public.upload_intents (session_id, storage_path)
  values (v_session.id, p_storage_path);
  return v_session.id;
end;
$function$;

create or replace function public.classinbox_heartbeat_upload(
  p_public_token text, p_storage_path text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_session public.sessions%rowtype;
begin
  select s.* into v_session
    from public.sessions s
    join public.upload_intents ui on ui.session_id = s.id
   where s.public_token = p_public_token
     and ui.storage_path = p_storage_path
     and ui.status = 'started'
   for update of s;

  if not found or v_session.is_active is distinct from true
     or v_session.cleanup_started_at is not null
     or v_session.last_activity_at <= now() - interval '30 minutes' then
    raise exception 'SESSION_UNAVAILABLE';
  end if;

  update public.upload_intents
     set last_heartbeat_at = now()
   where session_id = v_session.id and storage_path = p_storage_path and status = 'started';
  if not found then raise exception 'UPLOAD_INTENT_UNAVAILABLE'; end if;

  update public.sessions set last_activity_at = now() where id = v_session.id;
  return true;
end;
$function$;

create or replace function public.classinbox_finish_upload(
  p_public_token text, p_storage_path text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  v_session public.sessions%rowtype;
  v_status text;
begin
  select * into v_session
    from public.sessions
   where public_token = p_public_token
   for update;

  if not found or v_session.is_active is distinct from true
     or v_session.cleanup_started_at is not null
     or v_session.last_activity_at <= now() - interval '30 minutes' then
    raise exception 'SESSION_UNAVAILABLE';
  end if;

  select status into v_status
    from public.upload_intents
   where session_id = v_session.id and storage_path = p_storage_path;

  if not found then raise exception 'UPLOAD_INTENT_UNAVAILABLE'; end if;

  if v_status = 'started' then
    update public.upload_intents
       set status = 'completed', completed_at = now(), last_heartbeat_at = now()
     where session_id = v_session.id and storage_path = p_storage_path and status = 'started';
  elsif v_status <> 'completed' then
    raise exception 'UPLOAD_INTENT_UNAVAILABLE';
  end if;

  update public.sessions set last_activity_at = now() where id = v_session.id;
  return true;
end;
$function$;

create or replace function public.classinbox_fail_upload(
  p_public_token text, p_storage_path text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare v_updated integer;
begin
  update public.upload_intents ui
     set status = 'failed'
    from public.sessions s
   where ui.session_id = s.id and s.public_token = p_public_token
     and ui.storage_path = p_storage_path and ui.status = 'started'
     and s.cleanup_started_at is null;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

create or replace function public.classinbox_claim_expired_sessions(p_batch integer default 10)
returns table(session_id uuid)
language sql security definer
set search_path = pg_catalog, public
as $function$
  with candidates as (
    select s.id
      from public.sessions s
     where (
       (s.cleanup_started_at is null
        and s.last_activity_at <= now() - interval '30 minutes'
        and not exists (
          select 1 from public.upload_intents ui
           where ui.session_id = s.id and ui.status = 'started'
             and ui.last_heartbeat_at > now() - interval '2 minutes'
        ))
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

revoke all on function public.classinbox_begin_upload(text,text) from public, anon, authenticated;
revoke all on function public.classinbox_heartbeat_upload(text,text) from public, anon, authenticated;
revoke all on function public.classinbox_finish_upload(text,text) from public, anon, authenticated;
revoke all on function public.classinbox_fail_upload(text,text) from public, anon, authenticated;
revoke all on function public.classinbox_claim_expired_sessions(integer) from public, anon, authenticated;
grant execute on function public.classinbox_begin_upload(text,text) to service_role;
grant execute on function public.classinbox_heartbeat_upload(text,text) to service_role;
grant execute on function public.classinbox_finish_upload(text,text) to service_role;
grant execute on function public.classinbox_fail_upload(text,text) to service_role;
grant execute on function public.classinbox_claim_expired_sessions(integer) to service_role;
