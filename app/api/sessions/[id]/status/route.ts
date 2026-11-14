import { NextRequest, NextResponse } from "next/server";
import { isTeacherRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isTeacherRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const is_active = Boolean(body.is_active);
  const db = supabaseAdmin();
  const { error } = await db.from("sessions").update({ is_active, closed_at: is_active ? null : new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
