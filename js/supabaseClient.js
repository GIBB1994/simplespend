import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export function getSupabase() {
  const cfg = window.SS_CONFIG;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
    throw new Error("Missing SS_CONFIG in js/config.js");
  }
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}
