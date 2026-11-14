import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isTeacherRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { newPublicToken, cleanText } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: sessions, error } = await db.from("sessions").select("id,title,public_token,is_active,created_at,closed_at").order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (sessions || []).map((s) => s.id);
  let submissions: any[] = [];
  if (ids.length) {
    const result = await db.from("submissions").select("*").in("session_id", ids).order("created_at", { ascending: false });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    submissions = result.data || [];
  }
  return NextResponse.json({ sessions: sessions || [], submissions });
}

export async function POST(request: NextRequest) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const title = cleanText(body.title, 100);
  if (title.length < 2) return NextResponse.json({ error: "Session title must be at least 2 characters." }, { status: 400 });
  const token = newPublicToken();
  const db = supabaseAdmin();
  const { data, error } = await db.from("sessions").insert({ id: randomUUID(), title, public_token: token, is_active: true }).select("id,title,public_token,is_active,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
