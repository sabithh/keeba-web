import { Router } from "express";
import { generateAssistantReply } from "../lib/chatService";
import { query } from "../lib/db";
import {
  extractInboundTextMessages,
  sendWhatsAppTextMessage,
  splitWhatsAppText,
  verifyWhatsAppWebhookSignature,
  WhatsAppInboundTextMessage,
} from "../lib/whatsapp";

interface UserByPhoneRow {
  user_id: number;
  full_name: string | null;
}

const router = Router();

router.get("/webhook", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(500).send("WHATSAPP_VERIFY_TOKEN is not configured");
    return;
  }

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  if (!verifyWhatsAppWebhookSignature(req)) {
    res.status(401).json({ error: "Invalid WhatsApp signature" });
    return;
  }

  const inboundMessages = extractInboundTextMessages(req.body);

  // Return 200 early so Meta does not retry while Keeba generates replies.
  res.sendStatus(200);

  if (!inboundMessages.length) {
    return;
  }

  void processInboundBatch(inboundMessages);
});

async function processInboundBatch(messages: WhatsAppInboundTextMessage[]): Promise<void> {
  for (const message of messages) {
    try {
      await processInboundMessage(message);
    } catch (error) {
      console.error("WhatsApp message processing failed", {
        messageId: message.id,
        from: message.from,
        error,
      });

      try {
        await sendWhatsAppTextMessage(
          message.from,
          "Keeba is having trouble right now. Please try again in a minute."
        );
      } catch (sendError) {
        console.error("Failed to send WhatsApp fallback reply", {
          messageId: message.id,
          from: message.from,
          error: sendError,
        });
      }
    }
  }
}

async function processInboundMessage(message: WhatsAppInboundTextMessage): Promise<void> {
  const dedupeResult = await query<{ id: number }>(
    `INSERT INTO whatsapp_inbound_messages (wa_message_id, user_phone)
     VALUES ($1, $2)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id`,
    [message.id, message.from]
  );

  if (!dedupeResult.rowCount) {
    return;
  }

  const userResult = await query<UserByPhoneRow>(
    `SELECT user_id, full_name
     FROM profiles
     WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [message.from]
  );

  const user = userResult.rows[0];

  if (!user) {
    await sendWhatsAppTextMessage(
      message.from,
      "I could not match this WhatsApp number to a Keeba profile. Update your profile phone to include full country code (for example 9198xxxxxx) and try again."
    );
    return;
  }

  await query(
    "UPDATE whatsapp_inbound_messages SET user_id = $2 WHERE wa_message_id = $1",
    [message.id, user.user_id]
  );

  const assistantReply = await generateAssistantReply({
    userId: user.user_id,
    userMessage: message.text,
  });

  const chunks = splitWhatsAppText(assistantReply);

  for (const chunk of chunks) {
    await sendWhatsAppTextMessage(message.from, chunk);
  }
}

export default router;