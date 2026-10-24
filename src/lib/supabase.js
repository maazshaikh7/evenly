import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key);
export const supabase = isConfigured ? createClient(url, key) : null;

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Couldn’t start a session: ${error.message}. Check that anonymous sign-ins are enabled in Supabase.`);
  return signed.session;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id;
}

export async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
