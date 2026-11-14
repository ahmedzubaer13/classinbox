import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { maxFiles } from "@/lib/validation";

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length > 100) return NextResponse.json({ error: "Invalid session link." }, { status: 404 });

  const { data, error } = await supabaseAdmin().from("sessions")
    .select("title,is_active,last_activity_at,cleanup_started_at")
    .eq("public_token", token).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "This session link is invalid." }, { status: 404 });

  const notExpired = new Date(data.last_activity_at).getTime() > Date.now() - 30 * 60_000;
  const isActive = data.is_active && !data.cleanup_started_at && notExpired;
  return NextResponse.json({ title: data.title, isActive, maxFiles: maxFiles() });
}
