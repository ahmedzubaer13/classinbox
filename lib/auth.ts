import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "classinbox_teacher";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.TEACHER_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("TEACHER_SESSION_SECRET must be at least 32 characters.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createTeacherCookieValue() {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = String(expires);
  return `${payload}.${signature(payload)}`;
}

export function isTeacherRequest(request: NextRequest) {
  try {
    const value = request.cookies.get(COOKIE_NAME)?.value;
    if (!value) return false;
    const [expires, supplied] = value.split(".");
    if (!expires || !supplied || Number(expires) < Math.floor(Date.now() / 1000)) return false;
    const expected = signature(expires);
    const a = Buffer.from(supplied);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const teacherCookieName = COOKIE_NAME;
export const teacherCookieMaxAge = MAX_AGE_SECONDS;
