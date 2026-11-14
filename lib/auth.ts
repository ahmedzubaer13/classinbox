import { createHmac, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "classinbox_creator";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readCreatorSecret(request: NextRequest) {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  return value && /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
}

export function newCreatorSecret() {
  return randomBytes(32).toString("base64url");
}

export function creatorIdHash(creatorSecret: string) {
  return createHash("sha256").update(creatorSecret).digest("hex");
}

export function ownerHashForSession(creatorSecret: string, sessionId: string) {
  return createHmac("sha256", creatorSecret)
    .update(`classinbox-session-owner:${sessionId}`)
    .digest("hex");
}

export function setCreatorCookie(response: NextResponse, creatorSecret: string) {
  response.cookies.set(COOKIE_NAME, creatorSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export const creatorCookieName = COOKIE_NAME;
export const creatorCookieMaxAge = MAX_AGE_SECONDS;
