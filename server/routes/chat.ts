import { Router } from "express";
import { streamClaudeResponse } from "../lib/claude";
import { query } from "../lib/db";
import { authMiddleware } from "../middleware/authMiddleware";

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

const router = Router();

router.use(authMiddleware);

router.post("/message", async (req, res) => {
  const userId = req.user!.id;
  const { content } = req.body as { content?: string };

  if (!content || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const userMessage = content.trim();

  try {
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

    const systemPrompt = `
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

    await query(
      "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2)",
      [userId, userMessage]
    );

    const messagesForClaude = [
      ...history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      let assistantResponse = await streamClaudeResponse({
        systemPrompt,
        messages: messagesForClaude,
        onToken: (token) => {
          res.write(token);
        },
      });

      if (!assistantResponse) {
        assistantResponse = "I am here and ready to help. Could you share a bit more detail?";
        res.write(assistantResponse);
      }

      await query(
        "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'assistant', $2)",
        [userId, assistantResponse]
      );

      res.end();
    } catch (streamError) {
      console.error("Claude stream error", streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate assistant response" });
        return;
      }

      res.write("\n\n[Stream interrupted. Please try again.]");
      res.end();
    }
  } catch (error) {
    console.error("Chat message error", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

router.get("/history", async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await query<{
      id: number;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>(
      `SELECT id, role, content, created_at
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json([...result.rows].reverse());
  } catch (error) {
    console.error("Get history error", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

router.delete("/history", async (req, res) => {
  try {
    const userId = req.user!.id;
    await query("DELETE FROM chat_messages WHERE user_id = $1", [userId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Clear history error", error);
    res.status(500).json({ error: "Failed to clear chat history" });
  }
});

export default router;
