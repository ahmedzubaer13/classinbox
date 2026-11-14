# ClassInbox

**Scan. Upload. Done.** ClassInbox is a focused classroom file-submission app. A session creator shares a QR code; students scan it, enter their name and student ID, and upload files. The creator can view submissions and download individual files or one ZIP.

## Features

- QR-code submission sessions
- Mobile upload page; students need no account or app
- Multiple files per submission, with actual per-file upload progress
- Private Supabase Storage
- Individual downloads and session ZIP downloads
- Creator-only session management without a teacher login
- Sessions expire after 30 minutes of inactivity
- Upload heartbeats keep a session active while a file is genuinely transferring
- Scheduled cleanup removes stored files and retries failures

## Access model

No teacher accounts or shared password are used. The browser that creates a session receives a high-entropy, HTTP-only, SameSite=Strict creator cookie. The database stores only a per-session HMAC and a one-way creator lookup hash. That browser can list and manage its own sessions; other browsers cannot access those sessions.

**Important:** Access is tied to the browser profile that created the session. Do not clear its site cookies or use private/incognito mode for sessions that must remain accessible. There is no account-based recovery or cross-device transfer in this MVP. Anyone using the same unlocked browser profile can access its creator sessions.

Student QR links are upload-only. They do not reveal submissions or grant download access.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres and private Storage
- Vercel hosting
- Server-side Supabase secret key

## Local setup

1. Use Node.js 22.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Apply the SQL migrations in `supabase/migrations` to your Supabase project in timestamp order.
5. Create a private Storage bucket named `classinbox-submissions` with a 50 MB file limit.
6. Complete the cleanup worker setup below.
7. Run `npm run dev`.

Never expose `SUPABASE_SECRET_KEY` to client-side code or prefix it with `NEXT_PUBLIC_`.

## Supabase cleanup worker setup

The live Supabase project has this setup already enabled: the `classinbox-cleanup` Edge Function, Vault credential, and `classinbox-session-cleanup` cron job (every minute). For a new Supabase project:

1. Enable the `pg_cron`, `pg_net`, and `vault` extensions in Supabase.
2. Deploy the function from this repository:

   ```bash
   supabase functions deploy classinbox-cleanup --no-verify-jwt
   ```

3. Generate a strong random value locally (for example, `openssl rand -base64 48`). Do not commit it or send it in chat.
4. In the Supabase SQL Editor, replace the placeholder with that same random value and run this once:

   ```sql
   do $$
   declare
     v_secret text := 'REPLACE_WITH_YOUR_GENERATED_RANDOM_SECRET';
   begin
     perform vault.create_secret(
       v_secret,
       'classinbox_cleanup_secret',
       'ClassInbox scheduled cleanup authentication'
     );

     insert into classinbox_private.cleanup_credentials (id, secret_hash)
     values (true, extensions.crypt(v_secret, extensions.gen_salt('bf')))
     on conflict (id) do update
       set secret_hash = excluded.secret_hash;
   end;
   $$;
   ```

5. Schedule the worker once (use the SQL Editor):

   ```sql
   select cron.schedule(
     'classinbox-session-cleanup',
     '* * * * *',
     $job$
       select net.http_post(
         url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/classinbox-cleanup',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-classinbox-cron-secret',
           (select decrypted_secret
              from vault.decrypted_secrets
             where name = 'classinbox_cleanup_secret')
         ),
         body := jsonb_build_object('source', 'supabase-cron'),
         timeout_milliseconds := 10000
       );
     $job$
   );
   ```

   Replace `YOUR_PROJECT_REF` with the Supabase project reference. Do not schedule the same job twice.

The worker claims sessions after 30 minutes without meaningful activity, deletes Storage paths recorded in both submissions and upload intents, retries failed deletes, and retains a cleanup tombstone until all signed upload URLs have expired. The 2h15m retention window is measured from the start of cleanup, not the last heartbeat.

## Deployment

Connect this repository to Vercel. Configure the following environment variables for Production, Preview, and Development as required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` — a Supabase server-only secret key (`sb_secret_...`); a legacy `SUPABASE_SERVICE_ROLE_KEY` is also accepted as fallback
- `SUPABASE_STORAGE_BUCKET=classinbox-submissions`
- `NEXT_PUBLIC_APP_URL=https://classinbox.vercel.app`
- `MAX_FILE_SIZE_MB=50`
- `MAX_FILES_PER_SUBMISSION=10`

Set the Vercel Serverless Function region to `sin1` for the Mumbai-region Supabase project. Redeploy after changing environment variables.

## Known limitations

- Creator ownership is browser-profile-based, not an identity system. Clearing cookies or switching devices loses access to existing sessions.
- Student name and ID are self-reported and are not verified.
- Students need their own internet/mobile data.
- Signed upload URLs are valid for up to two hours. The cleanup worker waits 2h15m after cleanup begins before removing the session row, and re-removes all tracked object paths on each retry.
- Add rate limiting and quotas before a broad public launch.
