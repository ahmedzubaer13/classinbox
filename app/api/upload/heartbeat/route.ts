import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = cleanText(body.token, 200);
  const path = cleanText(body.path, 500);
  if (!token || !path) return NextResponse.json({ error: "Invalid upload heartbeat." }, { status: 400 });

  const { error } = await supabaseAdmin().rpc("classinbox_heartbeat_upload", {
    p_public_token: token,
    p_storage_path: path,
  });
  if (error) return NextResponse.json({ error: "This upload session is no longer active." }, { status: 410 });
  return NextResponse.json({ ok: true });
}
