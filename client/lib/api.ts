import { forceRefreshAccessToken, getAccessToken, getCurrentUser } from "./auth";
import {
  assertSupabaseConfigured,
  supabase,
  supabaseFunctionsKey,
  supabaseFunctionsBaseUrl,
} from "./supabase";

export interface Profile {
  id?: number;
  user_id?: string;
  full_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  occupation: string | null;
  about_me: string | null;
  custom_instructions: string | null;
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  user_id?: string;
  thread_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  last_message_at: string;
}

export interface DocumentRecord {
  id: number;
  user_id: string;
  name: string;
  type: "aadhaar" | "passport" | "license" | "certificate" | "photo" | "other";
  custom_type: string | null;
  file_url: string;
  storage_bucket: string;
  storage_path: string;
  extracted_text: string | null;
  created_at: string;
}

export interface VaultItemRecord {
  id: number;
  user_id: string;
  encrypted_payload: string;
  iv: string;
  salt: string;
  kdf_algorithm: string;
  kdf_iterations: number;
  key_version: number;
  created_at: string;
  updated_at: string;
}

export interface VaultItemInsert {
  encrypted_payload: string;
  iv: string;
  salt: string;
  kdf_algorithm: string;
  kdf_iterations: number;
  key_version: number;
}

export interface TelegramLinkCode {
  code: string;
  expires_at: string;
  bot_username: string | null;
  deep_link: string | null;
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    full_name: profile.full_name || "",
    date_of_birth: profile.date_of_birth || "",
    phone: profile.phone || "",
    address: profile.address || "",
    occupation: profile.occupation || "",
    about_me: profile.about_me || "",
    custom_instructions: profile.custom_instructions || "",
  };
}

async function getRequiredUserId(): Promise<string> {
  assertSupabaseConfigured();
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  return user.id;
}

export async function register(email: string, password: string): Promise<void> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    throw new Error("Account created. Please verify your email, then log in.");
  }
}

export async function login(email: string, password: string): Promise<void> {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getProfile(): Promise<Profile | null> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, date_of_birth, phone, address, occupation, about_me, custom_instructions, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeProfile(data as Profile) : null;
}

export async function updateProfile(payload: Profile): Promise<Profile> {
  const userId = await getRequiredUserId();
  const normalizedCustomInstructions = (payload.custom_instructions ?? "").trim().slice(0, 2000);

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        full_name: payload.full_name || null,
        date_of_birth: payload.date_of_birth || null,
        phone: payload.phone || null,
        address: payload.address || null,
        occupation: payload.occupation || null,
        about_me: payload.about_me || null,
        custom_instructions: normalizedCustomInstructions || null,
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, full_name, date_of_birth, phone, address, occupation, about_me, custom_instructions, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfile(data as Profile);
}

export async function getChatThreads(): Promise<ChatThread[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, user_id, title, created_at, last_message_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatThread[];
}

export async function getChatHistory(threadId: string | null): Promise<ChatMessage[]> {
  if (!threadId) {
    return [];
  }

  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, user_id, thread_id, role, content, created_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatMessage[];
}

export async function getChatHistoryByThread(threadId: string): Promise<ChatMessage[]> {
  return getChatHistory(threadId);
}

export async function clearChatHistory(): Promise<void> {
  const userId = await getRequiredUserId();
  const { error: threadError } = await supabase.from("chat_threads").delete().eq("user_id", userId);

  if (threadError) {
    throw new Error(threadError.message);
  }

  const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteChatThread(threadId: string): Promise<void> {
  const userId = await getRequiredUserId();
  const { error } = await supabase
    .from("chat_threads")
    .delete()
    .eq("id", threadId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
      msg?: string;
      code?: string;
    };
    if (body?.error) {
      return body.error as string;
    }

    if (body?.message) {
      return body.message;
    }

    if (body?.msg) {
      return body.msg;
    }

    if (body?.code) {
      return `Request failed (${response.status}): ${body.code}`;
    }
  } catch {
    // ignore json parse errors
  }

  return `Request failed (${response.status})`;
}

export async function getFiles(): Promise<DocumentRecord[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("documents")
    .select("id, user_id, name, type, custom_type, file_url, storage_bucket, storage_path, extracted_text, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentRecord[];
}

function sanitizeFilename(filename: string): string {
  return filename.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "");
}

export async function uploadFile(
  file: File,
  type: DocumentRecord["type"],
  customType?: string
): Promise<DocumentRecord> {
  const userId = await getRequiredUserId();
  const normalizedCustomType = (customType ?? "").trim().slice(0, 60);

  if (type === "other" && !normalizedCustomType) {
    throw new Error("Please enter a custom document type");
  }

  const filePath = `${userId}/${Date.now()}-${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage.from("keeba-files").upload(filePath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("keeba-files").getPublicUrl(filePath);

  let extractedText = "";
  const { data: extractionData, error: extractionError } = await supabase.functions.invoke(
    "extract-document-text",
    {
      body: {
        bucket: "keeba-files",
        path: filePath,
        mimeType: file.type,
      },
    }
  );

  if (!extractionError) {
    const typedExtraction = extractionData as { text?: string } | null;
    if (typedExtraction?.text) {
      extractedText = String(typedExtraction.text);
    }
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      name: file.name,
      type,
      custom_type: type === "other" ? normalizedCustomType : null,
      file_url: publicUrl,
      storage_bucket: "keeba-files",
      storage_path: filePath,
      extracted_text: extractedText || null,
    })
    .select("id, user_id, name, type, custom_type, file_url, storage_bucket, storage_path, extracted_text, created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentRecord;
}

export async function deleteFile(documentId: number): Promise<void> {
  const userId = await getRequiredUserId();
  const { data: document, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_bucket, storage_path")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!document) {
    throw new Error("Document not found");
  }

  const storageBucket = String(document.storage_bucket);
  const storagePath = String(document.storage_path);

  const { error: removeError } = await supabase.storage.from(storageBucket).remove([storagePath]);

  if (removeError) {
    throw new Error(removeError.message);
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }
}

export async function getVaultItems(): Promise<VaultItemRecord[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("vault_items")
    .select("id, user_id, encrypted_payload, iv, salt, kdf_algorithm, kdf_iterations, key_version, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VaultItemRecord[];
}

export async function createVaultItem(payload: VaultItemInsert): Promise<VaultItemRecord> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("vault_items")
    .insert({
      user_id: userId,
      encrypted_payload: payload.encrypted_payload,
      iv: payload.iv,
      salt: payload.salt,
      kdf_algorithm: payload.kdf_algorithm,
      kdf_iterations: payload.kdf_iterations,
      key_version: payload.key_version,
    })
    .select("id, user_id, encrypted_payload, iv, salt, kdf_algorithm, kdf_iterations, key_version, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as VaultItemRecord;
}

export async function deleteVaultItem(vaultItemId: number): Promise<void> {
  const userId = await getRequiredUserId();
  const { error } = await supabase
    .from("vault_items")
    .delete()
    .eq("id", vaultItemId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function streamChatMessage(
  content: string,
  onChunk: (chunk: string) => void,
  options?: {
    threadId?: string | null;
    onThreadId?: (threadId: string) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const signal = options?.signal;
  const requestedThreadId = options?.threadId ?? null;
  const hasUsableFunctionsKey = Boolean(supabaseFunctionsKey && !/^placeholder/i.test(supabaseFunctionsKey));

  type ChatAuthMode = "configured-key" | "access-token-key" | "no-key";

  async function callChatFunction(accessToken: string, authMode: ChatAuthMode): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    if (authMode === "configured-key" && hasUsableFunctionsKey) {
      headers.apikey = supabaseFunctionsKey;
    }

    if (authMode === "access-token-key") {
      headers.apikey = accessToken;
    }

    return fetch(`${supabaseFunctionsBaseUrl}/chat-message`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content, threadId: requestedThreadId }),
      signal,
    });
  }

  let token = await getAccessToken();

  if (!token) {
    token = await forceRefreshAccessToken();
  }

  if (!token) {
    throw new Error("Session unavailable. Please reopen the app and try again.");
  }

  let response = await callChatFunction(token, "configured-key");

  if (response.status === 401) {
    const refreshedToken = await forceRefreshAccessToken();

    if (refreshedToken) {
      token = refreshedToken;
      response = await callChatFunction(token, "configured-key");
    }
  }

  if (!response.ok && response.status === 401) {
    const unauthorizedMessage = await parseError(response);

    if (/invalid jwt|unauthorized/i.test(unauthorizedMessage)) {
      response = await callChatFunction(token, "access-token-key");
    } else {
      throw new Error("Session could not be verified. Please sign in again.");
    }
  }

  if (!response.ok && response.status === 401) {
    const unauthorizedMessage = await parseError(response);

    if (/invalid jwt|unauthorized/i.test(unauthorizedMessage)) {
      response = await callChatFunction(token, "no-key");
    } else {
      throw new Error("Session could not be verified. Please sign in again.");
    }
  }

  if (!response.ok) {
    const errorMessage = await parseError(response);

    if (response.status === 401) {
      throw new Error(
        "Chat authorization failed. Please refresh and sign in again. If this keeps happening, set NEXT_PUBLIC_SUPABASE_FUNCTIONS_KEY to your Supabase legacy anon key."
      );
    }

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Streaming is not available in this browser");
  }

  const resolvedThreadId = response.headers.get("x-thread-id");
  if (resolvedThreadId && options?.onThreadId) {
    options.onThreadId(resolvedThreadId);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    onChunk(decoder.decode(value, { stream: true }));
  }
}

export async function createTelegramLinkCode(): Promise<TelegramLinkCode> {
  assertSupabaseConfigured();

  const { data, error } = await supabase.functions.invoke("telegram-link-code", {
    method: "POST",
  });

  if (error) {
    throw new Error(error.message || "Failed to generate Telegram link code");
  }

  const response = (data ?? {}) as Partial<TelegramLinkCode>;
  const code = String(response.code ?? "").trim();
  const expiresAt = String(response.expires_at ?? "").trim();

  if (!code || !expiresAt) {
    throw new Error("Invalid Telegram link code response");
  }

  return {
    code,
    expires_at: expiresAt,
    bot_username: response.bot_username ? String(response.bot_username) : null,
    deep_link: response.deep_link ? String(response.deep_link) : null,
  };
}

export interface JournalThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: number;
  journal_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export async function getJournalThreads(): Promise<JournalThread[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('journal_threads')
    .select('id, user_id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as JournalThread[];
}

export async function getJournalEntries(journalId: string | null): Promise<JournalEntry[]> {
  if (!journalId) return [];

  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('journal_entries')
    .select('id, journal_id, user_id, content, created_at')
    .eq('user_id', userId)
    .eq('journal_id', journalId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as JournalEntry[];
}

export async function createJournalThread(title: string): Promise<JournalThread> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from('journal_threads')
    .insert([{ user_id: userId, title }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as JournalThread;
}

export async function addJournalEntry(journalId: string | null, content: string): Promise<{ entry: JournalEntry; threadId: string }> {
  let threadId = journalId;
  const userId = await getRequiredUserId();

  if (!threadId) {
    const titleMatch = content.split('\n')[0].substring(0, 30);
    const newThread = await createJournalThread(titleMatch || 'New Journal');
    threadId = newThread.id;
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .insert([{ journal_id: threadId, user_id: userId, content }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from('journal_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)
    .eq('user_id', userId);

  return { entry: data as JournalEntry, threadId };
}

export async function deleteJournalThread(journalId: string): Promise<void> {
  const userId = await getRequiredUserId();
  const { error } = await supabase
    .from('journal_threads')
    .delete()
    .eq('id', journalId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
