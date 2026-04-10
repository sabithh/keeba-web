// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface TelegramChat {
  id: number | string;
  type?: string;
}

interface TelegramUser {
  id?: number | string;
  username?: string;
  first_name?: string;
}

interface TelegramMessage {
  message_id?: number;
  text?: string;
  chat?: TelegramChat;
  from?: TelegramUser;
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

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

const TELEGRAM_MESSAGE_LIMIT = 3900;
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

function splitTelegramText(text: string, maxLength = TELEGRAM_MESSAGE_LIMIT): string[] {
  const normalizedText = text.replace(/\r\n/g, "\n").trim();

  if (!normalizedText) {
    return [];
  }

  if (normalizedText.length <= maxLength) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    let nextCursor = Math.min(cursor + maxLength, normalizedText.length);

    if (nextCursor < normalizedText.length) {
      const lastNewline = normalizedText.lastIndexOf("\n", nextCursor);
      const lastSpace = normalizedText.lastIndexOf(" ", nextCursor);
      const splitAt = Math.max(lastNewline, lastSpace);

      if (splitAt > cursor + Math.floor(maxLength * 0.5)) {
        nextCursor = splitAt;
      }
    }

    const chunk = normalizedText.slice(cursor, nextCursor).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    cursor = nextCursor;
  }

  return chunks;
}

function extractStartCode(inputText: string): string | null {
  const match = inputText.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) {
    return null;
  }

  const code = String(match[1] ?? "").trim().toUpperCase();
  return code || null;
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const blocks = Array.isArray((payload as { content?: unknown[] }).content)
    ? ((payload as { content?: unknown[] }).content as unknown[])
    : [];

  return blocks
    .filter((block) => {
      return Boolean(block && typeof block === "object" && (block as { type?: string }).type === "text");
    })
    .map((block) => String((block as { text?: string }).text ?? ""))
    .join("\n")
    .trim();
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
        .map((document) => {
          const documentType = document.type === "other" ? document.custom_type || document.type : document.type;
          const displayName = truncateText(document.name, MAX_DOCUMENT_NAME_CHARS) || "Untitled document";
          const extractedText = truncateText(document.extracted_text, MAX_DOCUMENT_TEXT_CHARS);

          return `[${documentType.toUpperCase()}] ${displayName}:\n${extractedText || "No extracted text available."}`;
        })
        .join("\n\n")
    : "No uploaded documents yet."
}

Always respond as a warm, intelligent personal assistant.
Follow the custom response instructions unless they conflict with safety rules.
Use clean markdown formatting with short paragraphs and bullet points when useful.
Never ask users to share passwords, OTPs, or full card details in normal chat.
If users ask to store credentials, instruct them to use the Secure Vault page or /vault commands.
Never expose full Aadhaar or passport numbers unless explicitly asked.
If asked about documents, refer to the extracted content above.

To set a reminder for the user, output exactly this xml tag anywhere in your response:
<SET_REMINDER task='[What to remind them]' time='[ISO 8601 UTC string]' />
Example: <SET_REMINDER task='Buy milk' time='2026-04-11T09:00:00Z' />
Keeba's background system will parse this tag and schedule the Telegram reminder.
`.trim();
}

async function sendTelegramTextMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Telegram send failed (${response.status}): ${details}`);
  }
}

async function loadOrCreateThreadId(serviceClient: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const latestThreadResult = await serviceClient
    .from("chat_threads")
    .select("id")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(1);

  if (latestThreadResult.error) {
    throw new Error("Failed to load chat thread");
  }

  const latestThread = Array.isArray(latestThreadResult.data) ? latestThreadResult.data[0] : null;
  if (latestThread?.id) {
    return String(latestThread.id);
  }

  const createdThreadResult = await serviceClient
    .from("chat_threads")
    .insert({
      user_id: userId,
      title: "Telegram chat",
    })
    .select("id")
    .single();

  if (createdThreadResult.error || !createdThreadResult.data?.id) {
    throw new Error("Failed to create chat thread");
  }

  return String(createdThreadResult.data.id);
}

async function generateAssistantReply(
  serviceClient: ReturnType<typeof createClient>,
  anthropicApiKey: string,
  userId: string,
  content: string,
  threadId: string
): Promise<string> {
  const [profileResult, historyResult, documentsResult] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("full_name, date_of_birth, phone, address, occupation, about_me, custom_instructions")
      .eq("user_id", userId)
      .maybeSingle(),
    serviceClient
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(20),
    serviceClient
      .from("documents")
      .select("name, type, custom_type, extracted_text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_DOCUMENTS_IN_PROMPT),
  ]);

  if (profileResult.error || historyResult.error || documentsResult.error) {
    throw new Error("Failed to fetch chat context");
  }

  const history = [...((historyResult.data as ChatMessageRow[] | null) ?? [])].reverse();
  const documents = (documentsResult.data as DocumentRow[] | null) ?? [];
  const systemPrompt = buildSystemPrompt((profileResult.data as ProfileRow | null) ?? null, documents);

  const userInsert = await serviceClient.from("chat_messages").insert({
    user_id: userId,
    thread_id: threadId,
    role: "user",
    content,
  });

  if (userInsert.error) {
    throw new Error("Failed to save user message");
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
      stream: false,
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

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    throw new Error(`Claude request failed: ${errorText}`);
  }

  const anthropicPayload = await anthropicResponse.json();
  const assistantReply =
    extractAssistantText(anthropicPayload) ||
    "I am here and ready to help. Could you share a bit more detail?";

  const reminderRegex = /<SET_REMINDER task='(.*?)' time='(.*?)'\s*\/>/g;
  let match;
  while ((match = reminderRegex.exec(assistantReply)) !== null) {
    await serviceClient.from("reminders").insert({
      user_id: userId,
      task: match[1],
      due_at: match[2],
    });
  }

  const assistantInsert = await serviceClient.from("chat_messages").insert({
    user_id: userId,
    thread_id: threadId,
    role: "assistant",
    content: assistantReply,
  });

  if (assistantInsert.error) {
    throw new Error("Failed to save assistant message");
  }

  await serviceClient
    .from("chat_threads")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", threadId)
    .eq("user_id", userId);

  return assistantReply;
}

async function markInboundMessage(
  serviceClient: ReturnType<typeof createClient>,
  payload: {
    updateId: string;
    messageId: string | null;
    chatId: string;
    telegramUserId: string | null;
    messageText: string;
    userId: string | null;
  }
): Promise<boolean> {
  const { error } = await serviceClient.from("telegram_inbound_messages").insert({
    telegram_update_id: payload.updateId,
    telegram_message_id: payload.messageId,
    telegram_chat_id: payload.chatId,
    telegram_user_id: payload.telegramUserId,
    message_text: payload.messageText,
    user_id: payload.userId,
  });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false;
  }

  throw new Error("Failed to store inbound Telegram message");
}

async function linkTelegramChat(
  serviceClient: ReturnType<typeof createClient>,
  payload: {
    code: string;
    chatId: string;
    telegramUsername: string | null;
  }
): Promise<{ ok: boolean; userId?: string; message: string }> {
  const codeResult = await serviceClient
    .from("telegram_link_codes")
    .select("id, user_id, expires_at, consumed_at")
    .eq("code", payload.code)
    .maybeSingle();

  if (codeResult.error || !codeResult.data) {
    return { ok: false, message: "Invalid or expired code. Generate a new code in Settings and try again." };
  }

  if (codeResult.data.consumed_at) {
    return { ok: false, message: "This code has already been used. Generate a new code in Settings." };
  }

  const expiresAt = new Date(String(codeResult.data.expires_at)).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, message: "This code has expired. Generate a fresh code in Settings." };
  }

  const consumeResult = await serviceClient
    .from("telegram_link_codes")
    .update({
      consumed_at: new Date().toISOString(),
    })
    .eq("id", codeResult.data.id)
    .is("consumed_at", null)
    .select("id")
    .limit(1);

  if (consumeResult.error || !consumeResult.data?.length) {
    return { ok: false, message: "This code is no longer valid. Please generate a new one." };
  }

  const upsertProfile = await serviceClient.from("profiles").upsert(
    {
      user_id: codeResult.data.user_id,
      telegram_chat_id: payload.chatId,
      telegram_username: payload.telegramUsername,
    },
    { onConflict: "user_id" }
  );

  if (upsertProfile.error) {
    if (upsertProfile.error.code === "23505") {
      return {
        ok: false,
        message:
          "This Telegram chat is already linked to another account. Unlink it first, then try again.",
      };
    }

    return { ok: false, message: "Unable to link Telegram account right now. Please try again." };
  }

  return {
    ok: true,
    userId: String(codeResult.data.user_id),
    message: "Telegram linked successfully. You can now chat with Keeba here.",
  };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

  if (!supabaseUrl || !supabaseServiceRoleKey || !anthropicApiKey || !telegramBotToken) {
    console.error("Telegram webhook misconfiguration");
    return new Response("ok", { status: 200 });
  }

  if (webhookSecret) {
    const providedSecret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (providedSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response("ok", { status: 200 });
  }

  const message = update?.message;
  const updateId = String(update?.update_id ?? "").trim();
  const chatId = String(message?.chat?.id ?? "").trim();
  const text = String(message?.text ?? "").trim();
  const messageId = message?.message_id != null ? String(message.message_id) : null;
  const telegramUserId = message?.from?.id != null ? String(message.from.id) : null;
  const telegramUsername = message?.from?.username ? String(message.from.username) : null;

  if (!updateId || !chatId || !text) {
    return new Response("ok", { status: 200 });
  }

  try {
    const isNewMessage = await markInboundMessage(serviceClient, {
      updateId,
      messageId,
      chatId,
      telegramUserId,
      messageText: text,
      userId: null,
    });

    if (!isNewMessage) {
      return new Response("ok", { status: 200 });
    }

    const startCode = extractStartCode(text);
    if (startCode) {
      const linkResult = await linkTelegramChat(serviceClient, {
        code: startCode,
        chatId,
        telegramUsername,
      });

      if (linkResult.ok && linkResult.userId) {
        await serviceClient
          .from("telegram_inbound_messages")
          .update({ user_id: linkResult.userId })
          .eq("telegram_update_id", updateId);
      }

      await sendTelegramTextMessage(telegramBotToken, chatId, linkResult.message);
      return new Response("ok", { status: 200 });
    }

    const linkedProfileResult = await serviceClient
      .from("profiles")
      .select("user_id")
      .eq("telegram_chat_id", chatId)
      .maybeSingle();

    if (linkedProfileResult.error || !linkedProfileResult.data?.user_id) {
      await sendTelegramTextMessage(
        telegramBotToken,
        chatId,
        "This chat is not linked yet. In Keeba Settings, generate a Telegram code and send /start YOUR_CODE here."
      );
      return new Response("ok", { status: 200 });
    }

    const userId = String(linkedProfileResult.data.user_id);

    await serviceClient
      .from("telegram_inbound_messages")
      .update({ user_id: userId })
      .eq("telegram_update_id", updateId);

    const threadId = await loadOrCreateThreadId(serviceClient, userId);
    const assistantReply = await generateAssistantReply(serviceClient, anthropicApiKey, userId, text, threadId);
    const chunks = splitTelegramText(assistantReply);

    if (!chunks.length) {
      await sendTelegramTextMessage(
        telegramBotToken,
        chatId,
        "I am here and ready to help. Could you share a bit more detail?"
      );
    } else {
      for (const chunk of chunks) {
        await sendTelegramTextMessage(telegramBotToken, chatId, chunk);
      }
    }
  } catch (error) {
    console.error("Telegram message processing failed", error);

    try {
      await sendTelegramTextMessage(
        telegramBotToken,
        chatId,
        "Keeba is having trouble right now. Please try again in a minute."
      );
    } catch (sendError) {
      console.error("Failed to send Telegram fallback reply", sendError);
    }
  }

  return new Response("ok", { status: 200 });
});
