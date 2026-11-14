import { NextRequest, NextResponse } from "next/server";
import { readCreatorSecret, ownerHashForSession } from "@/lib/auth";
import { supabaseAdmin, bucketName } from "@/lib/supabase-admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const creatorSecret = readCreatorSecret(request);
  if (!creatorSecret) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  const { id } = await context.params;
  const db = supabaseAdmin();
  const { data: submission } = await db.from("submissions")
    .select("session_id,storage_path,original_filename")
    .eq("id", id).maybeSingle();
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  const { data: session } = await db.from("sessions")
    .select("id,owner_key_hash,cleanup_started_at")
    .eq("id", submission.session_id).maybeSingle();
  if (!session || session.cleanup_started_at ||
      session.owner_key_hash !== ownerHashForSession(creatorSecret, session.id)) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  const { data, error } = await db.storage.from(bucketName())
    .createSignedUrl(submission.storage_path, 60, { download: submission.original_filename });
  if (error || !data) return NextResponse.json({ error: "Could not create download link." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
