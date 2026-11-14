import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readCreatorSecret, newCreatorSecret, creatorIdHash, ownerHashForSession, setCreatorCookie } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { newPublicToken, cleanText } from "@/lib/validation";
import type { Submission } from "@/lib/types";

export async function GET(request: NextRequest) {
  const creatorSecret = readCreatorSecret(request);
  if (!creatorSecret) return NextResponse.json({ sessions: [], submissions: [] }, { headers: { "Cache-Control": "no-store" } });

  const db = supabaseAdmin();
  const { data: sessions, error } = await db
    .from("sessions")
    .select("id,title,public_token,is_active,created_at,closed_at,last_activity_at,cleanup_started_at")
    .eq("owner_id_hash", creatorIdHash(creatorSecret))
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: "Could not load sessions." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  const owned = sessions ?? [];
  const ids = owned.map((session) => session.id);
  let submissions: Submission[] = [];

  if (ids.length) {
    const result = await db.from("submissions").select("*").in("session_id", ids).order("created_at", { ascending: false });
    if (result.error) return NextResponse.json({ error: "Could not load submissions." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    submissions = (result.data ?? []) as Submission[];
  }

  return NextResponse.json({ sessions: owned, submissions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = cleanText(body.title, 100);
  if (title.length < 2) return NextResponse.json({ error: "Session title must be at least 2 characters." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const creatorSecret = readCreatorSecret(request) ?? newCreatorSecret();
  const id = randomUUID();
  const token = newPublicToken();
  const ownerKeyHash = ownerHashForSession(creatorSecret, id);
  const db = supabaseAdmin();

  const { data, error } = await db.from("sessions").insert({
    id,
    title,
    public_token: token,
    owner_key_hash: ownerKeyHash,
    owner_id_hash: creatorIdHash(creatorSecret),
    is_active: true,
  }).select("id,title,public_token,is_active,created_at,closed_at,last_activity_at,cleanup_started_at").single();

  if (error || !data) return NextResponse.json({ error: "Could not create the session." }, { status: 500, headers: { "Cache-Control": "no-store" } });

  const response = NextResponse.json({ session: data }, { headers: { "Cache-Control": "no-store" } });
  if (!readCreatorSecret(request)) setCreatorCookie(response, creatorSecret);
  return response;
}
