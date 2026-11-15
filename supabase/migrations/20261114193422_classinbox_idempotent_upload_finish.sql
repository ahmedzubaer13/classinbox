-- Keep upload completion idempotent when the client retries after a lost response.
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
  select * into v_session from public.sessions
   where public_token = p_public_token for update;

  if not found or v_session.is_active is distinct from true
     or v_session.cleanup_started_at is not null
     or v_session.last_activity_at <= now() - interval '30 minutes' then
    raise exception 'SESSION_UNAVAILABLE';
  end if;

  select status into v_status from public.upload_intents
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

revoke all on function public.classinbox_finish_upload(text,text) from public, anon, authenticated;
grant execute on function public.classinbox_finish_upload(text,text) to service_role;
