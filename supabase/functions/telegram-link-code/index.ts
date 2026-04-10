// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_CODE_TTL_MINUTES = 30;
const CODE_LENGTH = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function generateCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";

  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }

  return code;
}

function normalizeBotUsername(rawValue: string | undefined): string | null {
  const normalized = String(rawValue ?? "")
    .trim()
    .replace(/^@/, "");

  return normalized || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: "Missing Supabase function environment" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization token" }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const ttlMinutes = Math.max(
    5,
    Number.parseInt(Deno.env.get("TELEGRAM_LINK_CODE_TTL_MINUTES") ?? `${DEFAULT_CODE_TTL_MINUTES}`, 10) ||
      DEFAULT_CODE_TTL_MINUTES
  );
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const { error: cleanupError } = await serviceClient
    .from("telegram_link_codes")
    .delete()
    .eq("user_id", user.id)
    .is("consumed_at", null);

  if (cleanupError) {
    return jsonResponse({ error: "Failed to prepare Telegram link code" }, 500);
  }

  let code = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCode(CODE_LENGTH);

    const { error: insertError } = await serviceClient.from("telegram_link_codes").insert({
      user_id: user.id,
      code: candidate,
      expires_at: expiresAt,
      consumed_at: null,
    });

    if (!insertError) {
      code = candidate;
      break;
    }

    if (insertError.code === "23505") {
      continue;
    }

    return jsonResponse({ error: "Failed to generate Telegram link code" }, 500);
  }

  if (!code) {
    return jsonResponse({ error: "Unable to generate a unique Telegram link code" }, 500);
  }

  const botUsername = normalizeBotUsername(Deno.env.get("TELEGRAM_BOT_USERNAME"));
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

  return jsonResponse({
    code,
    expires_at: expiresAt,
    bot_username: botUsername,
    deep_link: deepLink,
  });
});
