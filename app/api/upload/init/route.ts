import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin, bucketName } from "@/lib/supabase-admin";
import { maxFileSize, maxFiles, safeFilename, cleanText } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = cleanText(body.token, 200);
  const name = safeFilename(cleanText(body.filename, 200));
  const size = Number(body.size);
  const batchSize = Number(body.batchSize);

  if (!token || !name || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > maxFiles()) {
    return NextResponse.json({ error: `You can submit up to ${maxFiles()} files at a time.` }, { status: 400 });
  }
  if (size > maxFileSize()) {
    return NextResponse.json({ error: `Each file must be ${Math.round(maxFileSize()/1024/1024)} MB or smaller.` }, { status: 413 });
  }

  const db = supabaseAdmin();
  const { data: session, error: sessionError } = await db.from("sessions")
    .select("id,is_active,last_activity_at,cleanup_started_at")
    .eq("public_token", token).maybeSingle();

  if (sessionError || !session) return NextResponse.json({ error: "This session link is invalid." }, { status: 404 });
  if (!session.is_active || session.cleanup_started_at ||
      new Date(session.last_activity_at).getTime() <= Date.now() - 30 * 60_000) {
    return NextResponse.json({ error: "This session has expired or is closed." }, { status: 410 });
  }

  const path = `${session.id}/${randomUUID()}-${name}`;
  const { error: intentError } = await db.rpc("classinbox_begin_upload", {
    p_public_token: token,
    p_storage_path: path,
  });
  if (intentError) return NextResponse.json({ error: "This session has expired or is closed." }, { status: 410 });

  const { data, error } = await db.storage.from(bucketName()).createSignedUploadUrl(path);
  if (error || !data) {
    await db.rpc("classinbox_fail_upload", { p_public_token: token, p_storage_path: path });
    return NextResponse.json({ error: "Could not prepare upload." }, { status: 500 });
  }

  return NextResponse.json({ path, signedToken: data.token, bucket: bucketName(), maxFiles: maxFiles() });
}
