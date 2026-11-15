-- ClassInbox initial schema.
-- All data access is performed by trusted Next.js server routes using service_role.
-- No anon/authenticated policies are intentionally created.

create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 100),
  public_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists sessions_created_at_idx
  on public.sessions (created_at desc);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_name text not null check (char_length(student_name) between 2 and 100),
  student_id text not null check (char_length(student_id) between 1 and 50),
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now()
);

create index if not exists submissions_session_created_idx
  on public.submissions (session_id, created_at desc);

alter table public.sessions enable row level security;
alter table public.submissions enable row level security;

revoke all on public.sessions from anon, authenticated;
revoke all on public.submissions from anon, authenticated;

-- Storage bucket must be created as PRIVATE in the Supabase dashboard.
-- Do not add public Storage policies. Signed URLs are issued by the server.

-- Explicit Data API grants for trusted server-side service_role access only.
grant usage on schema public to service_role;
grant all on table public.sessions to service_role;
grant all on table public.submissions to service_role;
