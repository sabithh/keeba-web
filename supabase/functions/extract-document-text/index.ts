// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function toBase64(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function extractWithClaude(
  anthropicApiKey: string,
  bytes: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return "";
  }

  const source = {
    type: "base64",
    media_type: mimeType,
    data: toBase64(bytes),
  };

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all readable text from this document. Return plain text only.",
          },
          isImage
            ? {
                type: "image",
                source,
              }
            : {
                type: "document",
                source,
              },
        ],
      },
    ],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return "";
  }

  const data = await response.json();
  const contentBlocks = Array.isArray(data?.content) ? data.content : [];

  return contentBlocks
    .filter((block: { type?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("\n")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Missing Supabase function environment", 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonError("Missing authorization token", 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Unauthorized", 401);
  }

  const body = await req.json();
  const bucket = String(body?.bucket ?? "keeba-files");
  const path = String(body?.path ?? "");
  const mimeType = String(body?.mimeType ?? "application/octet-stream");

  if (!path || !path.startsWith(`${user.id}/`)) {
    return jsonError("Invalid file path", 400);
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);

  if (downloadError || !fileBlob) {
    return jsonError(downloadError?.message || "Unable to fetch file", 500);
  }

  let extractedText = "";

  try {
    if (mimeType.startsWith("text/")) {
      extractedText = (await fileBlob.text()).slice(0, 50000);
    } else {
      const bytes = await fileBlob.arrayBuffer();
      if (anthropicApiKey) {
        extractedText = await extractWithClaude(anthropicApiKey, bytes, mimeType);
      }
    }
  } catch {
    extractedText = "";
  }

  return new Response(
    JSON.stringify({
      text: extractedText,
    }),
    {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
});
