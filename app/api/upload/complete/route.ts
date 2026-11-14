import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, bucketName } from "@/lib/supabase-admin";
import { maxFileSize, safeFilename, cleanText } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = cleanText(body.token, 200);
  const path = cleanText(body.path, 500);
  const studentName = cleanText(body.studentName, 100);
  const studentId = cleanText(body.studentId, 50);
  const filename = safeFilename(cleanText(body.filename, 200));
  const size = Number(body.size);
  const mimeType = cleanText(body.mimeType, 120) || "application/octet-stream";

  if (!token || !path || !studentName || !studentId || !filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Please provide your name, student ID and valid file details." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (studentName.length < 2 || size > maxFileSize()) {
    return NextResponse.json({ error: "Invalid student details or file size." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const db = supabaseAdmin();
  const { data: session } = await db.from("sessions")
    .select("id,is_active,cleanup_started_at")
    .eq("public_token", token).maybeSingle();
  if (!session || !session.is_active || session.cleanup_started_at) {
    return NextResponse.json({ error: "This session is no longer accepting submissions." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  if (!path.startsWith(`${session.id}/`)) {
    return NextResponse.json({ error: "Invalid upload path." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const { data: existing } = await db.from("submissions").select("id").eq("storage_path", path).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, submissionId: existing.id }, { headers: { "Cache-Control": "no-store" } });

  const leaf = path.slice(path.lastIndexOf("/") + 1);
  const { data: objects, error: listError } = await db.storage.from(bucketName())
    .list(session.id, { search: leaf, limit: 10 });
  if (listError || !objects?.some((item) => item.name === leaf)) {
    return NextResponse.json({ error: "Uploaded file could not be verified. Please retry." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { error: finishError } = await db.rpc("classinbox_finish_upload", {
    p_public_token: token,
    p_storage_path: path,
  });
  if (finishError) return NextResponse.json({ error: "This session expired before the upload could be finalized." }, { status: 410, headers: { "Cache-Control": "no-store" } });

  const { data, error } = await db.from("submissions").insert({
    session_id: session.id,
    student_name: studentName,
    student_id: studentId,
    original_filename: filename,
    storage_path: path,
    mime_type: mimeType,
    file_size: size,
  }).select("id").single();

  if (error || !data) {
    const { data: retry } = await db.from("submissions").select("id").eq("storage_path", path).maybeSingle();
    if (retry) return NextResponse.json({ ok: true, submissionId: retry.id }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Upload received, but submission confirmation failed. Please retry." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, submissionId: data.id }, { headers: { "Cache-Control": "no-store" } });
}
