create index if not exists sessions_cleanup_retry_idx
  on public.sessions (cleanup_retry_after)
  where cleanup_started_at is not null;
