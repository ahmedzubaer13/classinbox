alter table public.sessions
  add column if not exists owner_id_hash text;

create index if not exists sessions_owner_id_hash_idx
  on public.sessions (owner_id_hash, created_at desc);
