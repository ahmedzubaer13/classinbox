import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function assertSupabaseConfigured() {
  if (!url || !serviceKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and the server-only SUPABASE_SECRET_KEY.");
  }
}

export function supabaseAdmin() {
  assertSupabaseConfigured();
  return createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const bucketName = () => process.env.SUPABASE_STORAGE_BUCKET || "classinbox-submissions";
