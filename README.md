# ClassInbox

A focused classroom file-submission MVP. Teachers create a session and display a QR code. Students scan it, select multiple files, see upload progress, and submit. Teachers can download individual files or all submissions as a ZIP.

## MVP features

- Password-protected teacher dashboard
- QR-code session creation
- Public mobile-friendly upload page
- Multiple files per submission
- Per-file upload progress using XMLHttpRequest
- Private Supabase Storage bucket
- Individual signed downloads
- Server-generated ZIP download
- Session close/reopen controls

## Architecture

- Next.js App Router (web UI and server routes)
- Supabase Postgres (sessions and submission metadata)
- Supabase Storage (private file objects)
- Signed upload URLs: the server validates the session and creates a one-use upload URL; the browser uploads directly to Storage.
- Teacher password is checked server-side. The service-role key never reaches the browser.

## Requirements

- Node.js 22+
- A Supabase project
- npm

## 1. Install

```bash
npm install
cp .env.example .env.local
```

Fill in all environment variables in `.env.local`. Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable.

Generate a session secret, for example:

```bash
openssl rand -base64 48
```

## 2. Configure Supabase

1. Open the Supabase SQL Editor.
2. Run `supabase/migrations/0001_initial.sql`.
3. Create a **private** Storage bucket named `classinbox-submissions` (or the name in `SUPABASE_STORAGE_BUCKET`).
4. Set a sensible global file-size limit in Supabase Storage. The app also enforces `MAX_FILE_SIZE_MB`.
5. Copy the project URL, publishable/anon key, and service-role key into `.env.local`.

The migration intentionally enables RLS and creates no public policies. All database operations happen through server routes using the service-role key. The service-role key is server-only.

## 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000. The default teacher route is `/teacher`.

## 4. Deploy

Deploy to Vercel or another Node-compatible host. Configure the same environment variables in the deployment settings. Run the SQL migration and create the private bucket before accepting submissions.

## Security notes

- The teacher dashboard is protected by an HMAC-signed, HttpOnly cookie.
- Student upload URLs are short-lived Supabase signed upload URLs and are scoped to a generated object path.
- Student uploads are restricted by active session, file count, file size, and file name sanitization.
- Storage remains private. Downloads are issued through short-lived signed URLs.
- The teacher password is a single-admin MVP mechanism. Before multi-teacher/public production use, replace it with proper individual teacher accounts, password hashing, rate limiting, audit logging, and account recovery.
- Add rate limiting / CAPTCHA to session and upload-init endpoints before a public launch. Enforce upload quotas and monitor Storage usage.
- A QR link is a bearer link: anyone who has it can submit while the session is open. Close sessions promptly and avoid displaying sensitive session details.

## Current MVP limitations

- One shared teacher password.
- Student identity is self-reported (name and student ID); it is not verified.
- Uploads require student internet/mobile data.
- Upload progress is per file. If a mobile connection drops, the student can retry the failed file; resumable chunk upload is not yet implemented.
- ZIP creation buffers one file at a time in the server process. For very large sessions, move ZIP generation to a background job/object-storage export.

## Scripts

```bash
npm run dev
npm run build
npm run start
```
