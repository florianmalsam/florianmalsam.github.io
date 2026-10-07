import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const teamEmail = import.meta.env.VITE_TEAM_EMAIL;
export const configured = Boolean(url && key && teamEmail);
export const cloud = configured ? createClient(url, key, {
  auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;