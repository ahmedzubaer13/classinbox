import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createTeacherCookieValue, teacherCookieName, teacherCookieMaxAge } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) return NextResponse.json({ error: "Teacher password is not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const supplied = typeof body.password === "string" ? body.password : "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  const passwordMatches = suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (supplied.length > 200 || !passwordMatches) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(teacherCookieName, createTeacherCookieValue(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: teacherCookieMaxAge,
  });
  return response;
}
