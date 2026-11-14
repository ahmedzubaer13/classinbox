# Claude build challenge prompt — ClassInbox

You are a senior full-stack engineer and product designer. Build **ClassInbox** independently from a clean starting point in a separate folder/repository. Do not copy another assistant's implementation or merely review it. Do not merely describe an approach: implement the working application, run checks, fix issues, and document exactly what remains.

## Product

ClassInbox lets a teacher create a submission session and display a QR code. Students scan it on a phone, enter their name and student ID, select multiple files, see real upload progress, and submit. The teacher can download each file individually or download every submission for a session as one ZIP.

The product is deliberately small. Do not add an LMS, grading, course administration, student accounts, analytics, chat, or unrelated features.

## Non-negotiable constraints

- No additional hardware.
- Teacher's computer always has internet through Ethernet.
- Students can use mobile data; do not rely on classroom Wi-Fi.
- Students must not install an app or create an account.
- The student upload experience must work well on mobile browsers.
- The teacher dashboard is password protected.
- Files must be stored in a private Supabase Storage bucket.
- The Supabase service-role key must never reach the browser.
- QR links must use high-entropy unguessable tokens.
- Enforce active/closed session status server-side.
- Support multiple files per submission and show honest per-file byte-based upload progress.
- Teacher must be able to download individual files and all session files as a ZIP.

## Preferred stack

- Next.js App Router + TypeScript + React
- Supabase Postgres and private Storage
- Vercel-compatible Node.js route handlers
- QR code generation library
- ZIP streaming/generation on the server
- Clean, responsive CSS or Tailwind

You may improve the stack if you explain why. Pin dependency versions and include a lockfile.

## Required user flows

### Teacher
1. Open `/teacher`.
2. Authenticate with a server-configured teacher password (single-admin MVP is acceptable).
3. Create a session by entering a title.
4. See the session QR code and copyable URL.
5. See submissions appear after refresh or through realtime updates.
6. Download any file individually.
7. Download all files in one ZIP, with files organized into folders named using student ID and name.
8. Close and reopen a session.

### Student
1. Scan a session QR code or open its link.
2. Enter name and student ID.
3. Select multiple files.
4. See file names, sizes, per-file upload progress, completion and error states.
5. Retry failed uploads without re-uploading files already completed.
6. See a clear confirmation after successful submission.

## Data model

Create a migration for:
- `sessions`: id, title, high-entropy public token or token hash, active status, created/closed timestamps.
- `submissions`: id, session id, student name, student ID, original filename, private storage path, MIME type, file size, created timestamp.

Enable RLS on exposed tables. Prefer no public database policies if all database access is through trusted server routes using the service-role client. Keep Storage private and use scoped signed upload URLs and short-lived signed download URLs.

## Security and reliability

- Validate every request on the server.
- Never trust client-provided session IDs, storage paths, filenames, MIME types, or file sizes without validation.
- Sanitize filenames and prevent path traversal.
- Enforce maximum file size and maximum files per submission.
- Validate the session is active before issuing signed upload URLs and again before recording completed submissions.
- Verify the uploaded object exists before inserting submission metadata.
- Make completion idempotent to avoid duplicate metadata rows.
- Protect teacher endpoints with a secure HttpOnly, SameSite cookie and signed session.
- Use constant-time comparison for secrets where appropriate.
- Add basic rate limiting or clearly document a production-ready rate-limiting layer.
- Avoid exposing whether arbitrary session tokens exist beyond what the student flow needs.
- Ensure download and ZIP endpoints require teacher authorization.
- ZIP generation must not buffer the entire archive in memory. Prefer streaming files into the archive, with limits and useful error handling.
- Do not use public bucket URLs.

## UX and visual quality

Create a distinctive, high-quality SaaS interface, not a generic unstyled admin template:
- Calm, modern visual identity with a clear ClassInbox wordmark.
- Teacher dashboard with a clear create-session panel, session list, counts and submission list.
- QR code displayed prominently with copy-link and preview actions.
- Student page designed mobile-first with large touch targets.
- Clear empty, loading, success, closed-session and error states.
- Accessible labels, keyboard support, focus styles and meaningful status text.
- Avoid fake data in the real product UI.
- Do not claim that files are saved locally on the teacher computer unless a real download/sync mechanism is implemented. In this MVP, files live in private cloud storage and the teacher downloads them.

## Deliverables

1. Complete runnable source code.
2. Supabase SQL migration and Storage bucket setup instructions.
3. `.env.example` with safe placeholders.
4. README with local setup, Supabase setup, and deployment steps.
5. Automated tests for token validation, session status, upload validation, and ZIP/download authorization where practical.
6. Run TypeScript, lint, tests, and production build. Fix all errors you can reproduce.
7. Provide a concise implementation summary and list of known limitations.

## Work method

- First inspect the existing repository and preserve useful work.
- Do not overwrite files blindly.
- Implement end-to-end, not just UI mockups.
- Verify actual upload progress; do not simulate it with timers.
- Verify ZIP downloads and individual downloads.
- If credentials are missing, build the integration and document the exact setup needed; never invent credentials.
- Be honest about what has and has not been tested.


## Comparison handoff

At the end, provide a short evidence-based scorecard covering: feature completeness, security, correctness of upload progress, mobile UX, accessibility, maintainability, test/build status, and setup friction. Include the exact commands you ran and their actual outputs. Do not claim a test passed unless you ran it.
