import { User } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabase } from "./supabase";

export async function getCurrentUser(): Promise<User | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  ) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getAccessToken(): Promise<string | null> {
  assertSupabaseConfigured();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return null;
  }

  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
    const { data, error } = await supabase.auth.refreshSession();

    if (!error) {
      return data.session?.access_token ?? null;
    }
  }

  return session?.access_token ?? null;
}

export async function forceRefreshAccessToken(): Promise<string | null> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    return null;
  }

  return data.session?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  assertSupabaseConfigured();
  await supabase.auth.signOut();
}
