import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const SERVICE_KEY =
  SECRET_KEYS.default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing Supabase server credentials");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BUCKET = "classinbox-submissions";
const PAGE_SIZE = 500;
const PATHS_PER_DELETE = 100;
const SIGNED_UPLOAD_GRACE_MS = 2 * 60 * 60 * 1000 + 15 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const suppliedSecret = req.headers.get("x-classinbox-cron-secret") ?? "";
  if (!suppliedSecret || suppliedSecret.length > 256) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: authorized, error: authError } = await supabase.rpc(
    "classinbox_validate_cleanup_secret",
    { p_candidate: suppliedSecret },
  );
  if (authError || authorized !== true) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "classinbox_claim_expired_sessions",
    { p_batch: 10 },
  );
  if (claimError) {
    console.error("Could not claim expired sessions", claimError.message);
    return Response.json({ error: "Could not claim expired sessions" }, { status: 500 });
  }

  const sessionIds = (claimed ?? []).map((row: { session_id: string }) => row.session_id);
  const result = { claimed: sessionIds.length, deleted: 0, retried: 0, filesRemoved: 0, waitingForSignedUrls: 0 };

  for (const sessionId of sessionIds) {
    try {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("cleanup_started_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session?.cleanup_started_at) throw new Error("Cleanup claim disappeared");

      const paths = new Set<string>();
      for (const table of ["submissions", "upload_intents"] as const) {
        let offset = 0;
        let pageLength = 0;
        do {
          const { data: page, error: pageError } = await supabase
            .from(table)
            .select("storage_path")
            .eq("session_id", sessionId)
            .order("storage_path", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
          if (pageError) throw pageError;
          pageLength = page?.length ?? 0;
          for (const row of page ?? []) {
            if (typeof row.storage_path === "string" && row.storage_path.length > 0) paths.add(row.storage_path);
          }
          offset += PAGE_SIZE;
        } while (pageLength === PAGE_SIZE);
      }

      const allPaths = [...paths];
      for (let index = 0; index < allPaths.length; index += PATHS_PER_DELETE) {
        const batch = allPaths.slice(index, index + PATHS_PER_DELETE);
        if (!batch.length) continue;
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(batch);
        if (removeError) throw removeError;
        result.filesRemoved += batch.length;
      }

      const cleanupStarted = new Date(session.cleanup_started_at).getTime();
      const signedUrlsExpired = Date.now() >= cleanupStarted + SIGNED_UPLOAD_GRACE_MS;
      if (!signedUrlsExpired) {
        const { error: retryError } = await supabase
          .from("sessions")
          .update({ cleanup_retry_after: new Date(Date.now() + 10 * 60_000).toISOString() })
          .eq("id", sessionId)
          .not("cleanup_started_at", "is", null);
        if (retryError) throw retryError;
        result.waitingForSignedUrls += 1;
        continue;
      }

      const { error: deleteError } = await supabase
        .from("sessions")
        .delete()
        .eq("id", sessionId)
        .not("cleanup_started_at", "is", null);
      if (deleteError) throw deleteError;
      result.deleted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown cleanup error";
      const { data: current } = await supabase
        .from("sessions")
        .select("cleanup_attempts")
        .eq("id", sessionId)
        .maybeSingle();
      const attempts = Math.min((current?.cleanup_attempts ?? 0) + 1, 10);
      const retryMinutes = Math.min(5 * (2 ** Math.min(attempts - 1, 4)), 60);

      await supabase.from("sessions").update({
        cleanup_attempts: attempts,
        cleanup_retry_after: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        cleanup_last_error: message.slice(0, 1000),
      }).eq("id", sessionId);

      console.error("Session cleanup will retry", { sessionId, message });
      result.retried += 1;
    }
  }

  return Response.json({ ok: true, ...result });
});
