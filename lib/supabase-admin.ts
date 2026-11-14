import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // Avoid throwing during static build; API handlers call assertSupabaseConfigured().
}

export function assertSupabaseConfigured() {
  if (!url || !serviceKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
}

export function supabaseAdmin() {
  assertSupabaseConfigured();
  return createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const bucketName = () => process.env.SUPABASE_STORAGE_BUCKET || "classinbox-submissions";
