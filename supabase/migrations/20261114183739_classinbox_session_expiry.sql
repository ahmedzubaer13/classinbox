-- Track meaningful activity and validate submissions against the 30-minute expiry.
alter table public.sessions
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists cleanup_started_at timestamptz;

create index if not exists sessions_last_activity_idx
  on public.sessions (last_activity_at)
  where cleanup_started_at is null;

create or replace function public.classinbox_touch_session_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.sessions
     set last_activity_at = now()
   where id = new.session_id
     and cleanup_started_at is null;
  return new;
end;
$function$;

drop trigger if exists classinbox_submission_activity on public.submissions;
create trigger classinbox_submission_activity
after insert or update of storage_path, file_size on public.submissions
for each row execute function public.classinbox_touch_session_from_submission();

create or replace function public.classinbox_touch_session_on_management()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if old.cleanup_started_at is null
     and new.cleanup_started_at is null
     and (
       new.title is distinct from old.title
       or new.is_active is distinct from old.is_active
       or new.closed_at is distinct from old.closed_at
     )
  then
    new.last_activity_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists classinbox_session_activity on public.sessions;
create trigger classinbox_session_activity
before update on public.sessions
for each row execute function public.classinbox_touch_session_on_management();

create or replace function public.classinbox_validate_submission_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_active boolean;
  v_cleanup_started timestamptz;
  v_last_activity timestamptz;
begin
  select is_active, cleanup_started_at, last_activity_at
    into v_active, v_cleanup_started, v_last_activity
    from public.sessions
   where id = new.session_id
   for update;

  if not found or v_active is distinct from true
     or v_cleanup_started is not null
     or v_last_activity <= now() - interval '30 minutes' then
    raise exception 'This submission session has expired or is closed';
  end if;
  return new;
end;
$function$;

drop trigger if exists classinbox_submission_session_valid on public.submissions;
create trigger classinbox_submission_session_valid
before insert on public.submissions
for each row execute function public.classinbox_validate_submission_session();
