import { NextRequest, NextResponse } from "next/server";
import { isTeacherRequest } from "@/lib/auth";
import { supabaseAdmin, bucketName } from "@/lib/supabase-admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const db = supabaseAdmin();
  const { data: submission, error } = await db.from("submissions").select("storage_path,original_filename").eq("id", id).maybeSingle();
  if (error || !submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const { data, error: signedError } = await db.storage.from(bucketName()).createSignedUrl(submission.storage_path, 60, { download: submission.original_filename });
  if (signedError || !data) return NextResponse.json({ error: "Could not create download link." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
