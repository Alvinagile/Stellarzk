import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export function getSupabaseRuntime() {
  if (!supabaseUrl || !supabaseKey) {
    return {
      configured: false,
      label: 'Supabase env missing',
      host: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
    };
  }

  return {
    configured: true,
    label: 'Supabase connected',
    host: new URL(supabaseUrl).host,
  };
}
