// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface ProfileRow {
  full_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  occupation: string | null;
  about_me: string | null;
  custom_instructions: string | null;
}

interface ChatMessageRow {
  role: "user" | "assistant";
  content: string;
}

interface DocumentRow {
  name: string;
  type: string;
  custom_type: string | null;
  extracted_text: string | null;
}

interface ChatThreadRow {
  id: string;
  title: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-thread-id",
};

const MAX_CUSTOM_INSTRUCTIONS_CHARS = 1200;
const MAX_DOCUMENT_TEXT_CHARS = 2200;
const MAX_DOCUMENT_NAME_CHARS = 120;
const MAX_DOCUMENTS_IN_PROMPT = 8;
const MAX_HISTORY_MESSAGE_CHARS = 2000;

function truncateText(value: string | null | undefined, maxChars: number): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "";
  }

  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
}

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function buildSystemPrompt(profile: ProfileRow | null, documents: DocumentRow[]): string {
  const effectiveProfile = profile ?? {
    full_name: "User",
    date_of_birth: null,
    phone: null,
    address: null,
    occupation: null,
    about_me: null,
    custom_instructions: null,
  };

  const customInstructions = truncateText(
    effectiveProfile.custom_instructions,
    MAX_CUSTOM_INSTRUCTIONS_CHARS
  );

  return `
You are Keeba, a personal AI assistant exclusively for ${effectiveProfile.full_name ?? "User"}.
You know everything about this person and remember all past conversations.

Personal details:
- Full name: ${effectiveProfile.full_name ?? "Unknown"}
- Date of birth: ${effectiveProfile.date_of_birth ?? "Unknown"}
- Phone: ${effectiveProfile.phone ?? "Unknown"}
- Address: ${effectiveProfile.address ?? "Unknown"}
- Occupation: ${effectiveProfile.occupation ?? "Unknown"}
- About: ${effectiveProfile.about_me ?? "Unknown"}

Custom response instructions from user:
${customInstructions || "No custom instructions provided."}

Their uploaded documents:
${
  documents.length
    ? documents
        .map(
          (document) => {
            const documentType = document.type === "other" ? document.custom_type || document.type : document.type;
            const displayName = truncateText(document.name, MAX_DOCUMENT_NAME_CHARS) || "Untitled document";
            const extractedText = truncateText(document.extracted_text, MAX_DOCUMENT_TEXT_CHARS);

            return `[${documentType.toUpperCase()}] ${displayName}:\n${extractedText || "No extracted text available."}`;
          }
        )
        .join("\n\n")
    : "No uploaded documents yet."
}

Always respond as a warm, intelligent personal assistant.
Follow the custom response instructions unless they conflict with safety rules.
Never ask users to share passwords, OTPs, or full card details in normal chat.
If users ask to store credentials, instruct them to use the Secure Vault page or /vault commands.
Never expose full Aadhaar or passport numbers unless explicitly asked.
If asked about documents, refer to the extracted content above.
`.trim();
}

function parseAnthropicChunk(line: string): string {
  if (!line.startsWith("data:")) {
    return "";
  }

  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") {
    return "";
  }

  try {
    const event = JSON.parse(payload);
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      return event.delta.text ?? "";
    }
  } catch {
    return "";
  }

  return "";
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
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonError("Missing Supabase function environment", 500);
  }

  if (!anthropicApiKey) {
    return jsonError("ANTHROPIC_API_KEY is not configured", 500);
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

  let content = "";
  let requestedThreadId: string | null = null;
  try {
    const body = await req.json();
    content = String(body?.content ?? "").trim();
    requestedThreadId = body?.threadId ? String(body.threadId).trim() : null;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!content) {
    return jsonError("content is required", 400);
  }

  let threadId = requestedThreadId;

  if (threadId) {
    const threadResult = await supabase
      .from("chat_threads")
      .select("id, title")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (threadResult.error) {
      return jsonError("Failed to load chat thread", 500);
    }

    if (!threadResult.data) {
      return jsonError("Thread not found", 404);
    }
  } else {
    const threadTitle = content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    const createdThreadResult = await supabase
      .from("chat_threads")
      .insert({
        user_id: user.id,
        title: threadTitle,
      })
      .select("id, title")
      .single();

    if (createdThreadResult.error || !createdThreadResult.data) {
      return jsonError("Failed to create chat thread", 500);
    }

    threadId = (createdThreadResult.data as ChatThreadRow).id;
  }

  if (!threadId) {
    return jsonError("Thread id is required", 500);
  }

  const [profileResult, historyResult, documentsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, date_of_birth, phone, address, occupation, about_me, custom_instructions")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("documents")
      .select("name, type, custom_type, extracted_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_DOCUMENTS_IN_PROMPT),
  ]);

  if (profileResult.error || historyResult.error || documentsResult.error) {
    return jsonError("Failed to fetch context for chat", 500);
  }

  const history = [...(historyResult.data as ChatMessageRow[] ?? [])].reverse();
  const documents = (documentsResult.data as DocumentRow[] ?? []);
  const systemPrompt = buildSystemPrompt((profileResult.data as ProfileRow | null) ?? null, documents);

  const userInsert = await supabase.from("chat_messages").insert({
    user_id: user.id,
    thread_id: threadId,
    role: "user",
    content,
  });

  if (userInsert.error) {
    return jsonError("Failed to save user message", 500);
  }

  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      stream: true,
      system: systemPrompt,
      messages: [
        ...history.map((message) => ({
          role: message.role,
          content: truncateText(message.content, MAX_HISTORY_MESSAGE_CHARS),
        })),
        { role: "user", content },
      ],
    }),
  });

  if (!anthropicResponse.ok || !anthropicResponse.body) {
    const errorText = await anthropicResponse.text();
    return jsonError(`Claude request failed: ${errorText}`, 500);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let fullAssistantResponse = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = anthropicResponse.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const token = parseAnthropicChunk(line);
            if (!token) {
              continue;
            }

            fullAssistantResponse += token;
            controller.enqueue(encoder.encode(token));
          }
        }

        const trailingToken = parseAnthropicChunk(buffer.trim());
        if (trailingToken) {
          fullAssistantResponse += trailingToken;
          controller.enqueue(encoder.encode(trailingToken));
        }

        const finalText = fullAssistantResponse.trim() || "I am here and ready to help. Could you share a bit more detail?";

        if (!fullAssistantResponse.trim()) {
          controller.enqueue(encoder.encode(finalText));
        }

        await supabase.from("chat_messages").insert({
          user_id: user.id,
          thread_id: threadId,
          role: "assistant",
          content: finalText,
        });

        await supabase
          .from("chat_threads")
          .update({
            last_message_at: new Date().toISOString(),
          })
          .eq("id", threadId)
          .eq("user_id", user.id);

        controller.close();
      } catch {
        controller.enqueue(encoder.encode("\n\n[Stream interrupted. Please try again.]"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-thread-id": threadId,
    },
  });
});
