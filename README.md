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

1. Use Node.js 22 or newer.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and fill in the values.
4. Apply the SQL migrations in `supabase/migrations` to your Supabase project, in order.
5. Create a private Storage bucket named `classinbox-submissions` with a 50 MB file limit.
6. Run `npm run dev`.

Never expose `SUPABASE_SECRET_KEY` to client-side code or prefix it with `NEXT_PUBLIC_`.

## Supabase expiry worker

The deployed Supabase project has a scheduled `classinbox-cleanup` Edge Function and a cron job that runs every minute. It claims sessions after 30 minutes of inactivity, deletes tracked object paths, retries Storage errors, and preserves a cleanup tombstone until signed upload URLs have expired. Upload intents ensure objects are tracked even when the browser drops before the submission row is created.

## Deployment

Connect the GitHub repository to Vercel and set these environment variables for Production, Preview, and Development as needed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (server-only Supabase secret key; legacy service-role key is accepted as fallback)
- `SUPABASE_STORAGE_BUCKET=classinbox-submissions`
- `NEXT_PUBLIC_APP_URL=https://classinbox.vercel.app`
- `MAX_FILE_SIZE_MB=50`
- `MAX_FILES_PER_SUBMISSION=10`

Set the Vercel Serverless Function region to `sin1` for the Mumbai-region Supabase project.

## Known limitations

- Creator ownership is browser-profile-based, not an identity system. Clearing cookies or switching devices loses access to existing sessions.
- Student name and ID are self-reported and are not verified.
- Students need their own internet/mobile data.
- Uploads are direct to Supabase Storage using signed upload URLs; an individual signed upload URL is valid for two hours. The cleanup worker waits beyond this validity window before final session deletion.
- Add rate limiting and quotas before a broad public launch.
