import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cleanText } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = cleanText(body.token, 200);
  const path = cleanText(body.path, 500);
  if (!token || !path) return NextResponse.json({ error: "Invalid upload details." }, { ...{ status: 400 }, headers: { "Cache-Control": "no-store" } }, { headers: { "Cache-Control": "no-store" } });

  await supabaseAdmin().rpc("classinbox_fail_upload", {
    p_public_token: token,
    p_storage_path: path,
  });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
