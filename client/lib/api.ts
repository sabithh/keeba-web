import { getAccessToken, getCurrentUser } from "./auth";
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
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  user_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface DocumentRecord {
  id: number;
  user_id: string;
  name: string;
  type: "aadhaar" | "passport" | "license" | "certificate" | "photo" | "other";
  file_url: string;
  storage_bucket: string;
  storage_path: string;
  extracted_text: string | null;
  created_at: string;
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
    .select("id, user_id, full_name, date_of_birth, phone, address, occupation, about_me, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeProfile(data as Profile) : null;
}

export async function updateProfile(payload: Profile): Promise<Profile> {
  const userId = await getRequiredUserId();
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
      },
      { onConflict: "user_id" }
    )
    .select("id, user_id, full_name, date_of_birth, phone, address, occupation, about_me, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeProfile(data as Profile);
}

export async function getChatHistory(): Promise<ChatMessage[]> {
  const userId = await getRequiredUserId();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, user_id, role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChatMessage[];
}

export async function clearChatHistory(): Promise<void> {
  const userId = await getRequiredUserId();
  const { error } = await supabase.from("chat_messages").delete().eq("user_id", userId);

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
    .select("id, user_id, name, type, file_url, storage_bucket, storage_path, extracted_text, created_at")
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
  type: DocumentRecord["type"]
): Promise<DocumentRecord> {
  const userId = await getRequiredUserId();
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
      file_url: publicUrl,
      storage_bucket: "keeba-files",
      storage_path: filePath,
      extracted_text: extractedText || null,
    })
    .select("id, user_id, name, type, file_url, storage_bucket, storage_path, extracted_text, created_at")
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

export async function streamChatMessage(
  content: string,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = await getAccessToken();

  if (!token) {
    throw new Error("Missing authentication token");
  }

  const response = await fetch(`${supabaseFunctionsBaseUrl}/chat-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: supabaseFunctionsKey,
    },
    body: JSON.stringify({ content }),
    signal,
  });

  if (!response.ok) {
    const errorMessage = await parseError(response);

    if (response.status === 401 && /invalid jwt/i.test(errorMessage)) {
      throw new Error(
        "Invalid JWT from Supabase Functions. Set NEXT_PUBLIC_SUPABASE_FUNCTIONS_KEY to your Legacy anon key, redeploy, then sign out and sign in again."
      );
    }

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("Streaming is not available in this browser");
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
