import crypto from "crypto";
import { Request } from "express";

const DEFAULT_WHATSAPP_API_VERSION = "v22.0";
const WHATSAPP_TEXT_LIMIT = 3500;

export interface WhatsAppInboundTextMessage {
  id: string;
  from: string;
  text: string;
}

interface WhatsAppApiErrorResponse {
  error?: {
    message?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function verifyWhatsAppWebhookSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  const rawBody = req.rawBody;

  if (!signatureHeader || !signatureHeader.startsWith("sha256=") || !rawBody) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")}`;

  const providedBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function extractInboundTextMessages(payload: unknown): WhatsAppInboundTextMessage[] {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    return [];
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const inboundMessages: WhatsAppInboundTextMessage[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) {
      continue;
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      if (!isRecord(change) || !isRecord(change.value)) {
        continue;
      }

      const value = change.value;
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        if (!isRecord(message) || message.type !== "text" || !isRecord(message.text)) {
          continue;
        }

        const id = typeof message.id === "string" ? message.id : "";
        const from = typeof message.from === "string" ? normalizePhoneNumber(message.from) : "";
        const body = typeof message.text.body === "string" ? message.text.body.trim() : "";

        if (!id || !from || !body) {
          continue;
        }

        inboundMessages.push({ id, from, text: body });
      }
    }
  }

  return inboundMessages;
}

export function splitWhatsAppText(text: string, maxLength = WHATSAPP_TEXT_LIMIT): string[] {
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

export async function sendWhatsAppTextMessage(to: string, text: string): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || DEFAULT_WHATSAPP_API_VERSION;

  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be configured");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    }),
  });

  if (!response.ok) {
    let details = "";

    try {
      const errorBody = (await response.json()) as WhatsAppApiErrorResponse;
      details = errorBody.error?.message ?? "";
    } catch {
      details = await response.text();
    }

    throw new Error(
      `WhatsApp send failed with ${response.status}${details ? `: ${details}` : ""}`
    );
  }
}