import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamClaudeOptions {
  systemPrompt: string;
  messages: ClaudeChatMessage[];
  onToken: (token: string) => void;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function streamClaudeResponse({
  systemPrompt,
  messages,
  onToken,
}: StreamClaudeOptions): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const stream = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: systemPrompt,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stream: true,
  });

  let fullResponse = "";

  for await (const event of stream as AsyncIterable<any>) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const chunk = event.delta.text ?? "";
      fullResponse += chunk;
      onToken(chunk);
    }
  }

  return fullResponse.trim();
}
