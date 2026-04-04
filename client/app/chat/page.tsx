"use client";

import { useEffect, useRef, useState } from "react";
import ChatBubble from "@/components/ChatBubble";
import Sidebar from "@/components/Sidebar";
import {
  ChatMessage,
  clearChatHistory,
  getChatHistory,
  streamChatMessage,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { useRouter } from "next/navigation";

type UiMessage = ChatMessage & { streaming?: boolean; id: number };

export default function ChatPage(): JSX.Element {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      await loadHistory();
    })();
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const history = await getChatHistory();
      setMessages(history);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Could not load chat history");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const content = input.trim();
    if (!content || sending) {
      return;
    }

    setError(null);
    setSending(true);

    const nowIso = new Date().toISOString();
    const userMessage: UiMessage = {
      id: Date.now(),
      role: "user",
      content,
      created_at: nowIso,
    };

    const assistantId = Date.now() + 1;
    const assistantMessage: UiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
      streaming: true,
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");

    try {
      await streamChatMessage(content, (chunk) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: `${message.content}${chunk}`,
                }
              : message
          )
        );
      });

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                streaming: false,
              }
            : message
        )
      );
    } catch (requestError: unknown) {
      const message = requestError instanceof Error ? requestError.message : "Failed to stream response";
      setError(message);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: item.content || "I could not respond this time. Please retry.",
                streaming: false,
              }
            : item
        )
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClearHistory(): Promise<void> {
    setHistoryClearing(true);
    setError(null);

    try {
      await clearChatHistory();
      setMessages([]);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to clear history");
    } finally {
      setHistoryClearing(false);
    }
  }

  return (
    <main className="min-h-screen">
      <Sidebar />

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 md:ml-[230px] md:px-7 md:pt-6">
        <header className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold text-keeba-accentLight">Conversations</h1>
            <p className="text-sm text-keeba-textMuted">Keeba remembers your profile, files, and recent messages.</p>
          </div>
          <button
            type="button"
            disabled={historyClearing}
            onClick={() => void handleClearHistory()}
            className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm text-keeba-textPrimary hover:bg-keeba-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            {historyClearing ? "Clearing..." : "Clear History"}
          </button>
        </header>

        {error ? (
          <p className="mt-4 rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="surface-card mt-4 h-[60vh] overflow-y-auto p-4 md:p-5">
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-20 w-2/3" />
              <div className="skeleton ml-auto h-20 w-1/2" />
              <div className="skeleton h-20 w-3/4" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div>
                <p className="keeba-logo text-3xl">keeba</p>
                <p className="mt-2 text-sm text-keeba-textMuted">No chat history yet. Start by asking anything.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.created_at}
                  streaming={message.streaming}
                />
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="surface-card mt-4 flex items-end gap-3 p-3 md:p-4">
          <label className="flex-1">
            <span className="sr-only">Message Keeba</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={2}
              placeholder="Ask Keeba anything about your profile, plans, or documents..."
              className="w-full resize-none rounded-keeba border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={sending}
            className="rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </form>
      </section>
    </main>
  );
}
