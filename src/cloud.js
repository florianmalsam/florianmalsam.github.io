import { createClient } from '@supabase/supabase-js';
import { verifyAdminPassword } from './reauth.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const teamEmail = import.meta.env.VITE_TEAM_EMAIL;
export const readerEmail = 'xs_esl@web.de';
export const configured = Boolean(url && key && teamEmail);
export const cloud = configured ? createClient(url, key, {
  auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export async function reauthenticateAdmin(password, userId) {
  if (!configured) throw new Error('Admin-Anmeldung ist nicht verfügbar.');
  const temporary = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `tsb-reauth-${crypto.randomUUID()}` } });
  await verifyAdminPassword(temporary.auth, userId, teamEmail, password);
}