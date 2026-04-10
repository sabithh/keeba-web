import { streamClaudeResponse } from "./claude";
import { query } from "./db";

interface ChatMessageRow {
  role: "user" | "assistant";
  content: string;
}

interface ProfileContextRow {
  full_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  occupation: string | null;
  about_me: string | null;
}

interface DocumentContextRow {
  name: string;
  type: string;
  extracted_text: string | null;
}

interface GenerateAssistantReplyOptions {
  userId: number;
  userMessage: string;
  onToken?: (token: string) => void;
}

function buildSystemPrompt(profile: ProfileContextRow, documents: DocumentContextRow[]): string {
  return `
You are Keeba, a personal AI assistant exclusively for ${profile.full_name ?? "User"}.
You know everything about this person and remember all past conversations.

Personal details:
- Full name: ${profile.full_name ?? "Unknown"}
- Date of birth: ${profile.date_of_birth ?? "Unknown"}
- Phone: ${profile.phone ?? "Unknown"}
- Address: ${profile.address ?? "Unknown"}
- Occupation: ${profile.occupation ?? "Unknown"}
- About: ${profile.about_me ?? "Unknown"}

Their uploaded documents:
${
  documents.length
    ? documents
        .map(
          (document: DocumentContextRow) =>
            `[${document.type.toUpperCase()}] ${document.name}:\n${document.extracted_text ?? "No extracted text available."}`
        )
        .join("\n\n")
    : "No uploaded documents yet."
}

Always respond as a warm, intelligent personal assistant.
Never expose full Aadhaar or passport numbers unless explicitly asked.
If asked about documents, refer to the extracted content above.
`;
}

export async function generateAssistantReply({
  userId,
  userMessage,
  onToken,
}: GenerateAssistantReplyOptions): Promise<string> {
  const trimmedUserMessage = userMessage.trim();

  if (!trimmedUserMessage) {
    throw new Error("userMessage is required");
  }

  const [profileResult, historyResult, documentsResult] = await Promise.all([
    query<ProfileContextRow>(
      `SELECT full_name, date_of_birth, phone, address, occupation, about_me
       FROM profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    ),
    query<ChatMessageRow>(
      `SELECT role, content
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    ),
    query<DocumentContextRow>(
      `SELECT name, type, extracted_text
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    ),
  ]);

  const profile = profileResult.rows[0] ?? {
    full_name: "User",
    date_of_birth: null,
    phone: null,
    address: null,
    occupation: null,
    about_me: null,
  };

  const history = [...historyResult.rows].reverse();
  const documents = documentsResult.rows;
  const systemPrompt = buildSystemPrompt(profile, documents);

  await query(
    "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2)",
    [userId, trimmedUserMessage]
  );

  const messagesForClaude = [
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user" as const, content: trimmedUserMessage },
  ];

  const tokenSink = onToken ?? (() => undefined);

  let assistantResponse = await streamClaudeResponse({
    systemPrompt,
    messages: messagesForClaude,
    onToken: tokenSink,
  });

  if (!assistantResponse) {
    assistantResponse = "I am here and ready to help. Could you share a bit more detail?";
    tokenSink(assistantResponse);
  }

  await query(
    "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'assistant', $2)",
    [userId, assistantResponse]
  );

  return assistantResponse;
}