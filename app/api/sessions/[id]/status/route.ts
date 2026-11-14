import { NextRequest, NextResponse } from "next/server";
import { readCreatorSecret, ownerHashForSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const creatorSecret = readCreatorSecret(request);
  if (!creatorSecret) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Invalid session status." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.from("sessions")
    .update({ is_active: body.is_active, closed_at: body.is_active ? null : new Date().toISOString() })
    .eq("id", id)
    .eq("owner_key_hash", ownerHashForSession(creatorSecret, id))
    .is("cleanup_started_at", null)
    .gt("last_activity_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Could not update this session." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Session not found or its 30-minute inactivity period has ended." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
