import { Router } from "express";
import { generateAssistantReply } from "../lib/chatService";
import { query } from "../lib/db";
import { authMiddleware } from "../middleware/authMiddleware";

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
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    try {
      await generateAssistantReply({
        userId,
        userMessage,
        onToken: (token: string) => {
          res.write(token);
        },
      });

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
