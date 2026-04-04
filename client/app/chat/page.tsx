"use client";

import { useEffect, useRef, useState } from "react";
import ChatBubble from "@/components/ChatBubble";
import Sidebar from "@/components/Sidebar";
import {
  ChatThread,
  ChatMessage,
  clearChatHistory,
  createVaultItem,
  deleteVaultItem,
  getChatHistory,
  getChatThreads,
  getVaultItems,
  streamChatMessage,
  VaultItemRecord,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { decryptVaultPayload, encryptVaultPayload, VaultSecretPayload } from "@/lib/vaultCrypto";
import { useRouter } from "next/navigation";

type UiMessage = ChatMessage & { streaming?: boolean; id: number };

type ParsedVaultCommand =
  | { action: "help" }
  | { action: "list" }
  | { action: "save"; service: string; username: string; password: string; notes: string }
  | { action: "show"; id: number; reveal: boolean }
  | { action: "delete"; id: number };

function nextMessageId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function maskSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 2)}${"*".repeat(Math.max(6, value.length - 4))}${value.slice(-2)}`;
}

function redactVaultCommand(input: string): string {
  const trimmed = input.trim();

  if (!/^\/vault\s+save/i.test(trimmed)) {
    return trimmed;
  }

  const payload = trimmed.replace(/^\/vault\s+save/i, "").trim();
  const segments = payload.split("|").map((segment) => segment.trim());

  if (segments.length < 3) {
    return "/vault save [invalid format]";
  }

  const redacted = [segments[0], segments[1], "[REDACTED]"];

  if (segments.length > 3) {
    redacted.push("[NOTES REDACTED]");
  }

  return `/vault save ${redacted.join(" | ")}`;
}

function parseVaultCommand(input: string): {
  command: ParsedVaultCommand | null;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().startsWith("/vault")) {
    return { command: null };
  }

  const commandBody = trimmed.slice("/vault".length).trim();
  if (!commandBody || commandBody.toLowerCase() === "help") {
    return { command: { action: "help" } };
  }

  if (commandBody.toLowerCase() === "list") {
    return { command: { action: "list" } };
  }

  if (commandBody.toLowerCase().startsWith("save")) {
    const payload = commandBody.slice("save".length).trim();
    const segments = payload.split("|").map((segment) => segment.trim());

    if (segments.length < 3) {
      return {
        command: null,
        error: "Use: /vault save <service> | <username> | <password> | [optional notes]",
      };
    }

    return {
      command: {
        action: "save",
        service: segments[0],
        username: segments[1],
        password: segments[2],
        notes: segments.slice(3).join(" | "),
      },
    };
  }

  const [action, idText] = commandBody.split(/\s+/, 2);
  const lowerAction = action.toLowerCase();

  if (lowerAction === "show" || lowerAction === "reveal" || lowerAction === "delete") {
    const id = Number(idText);
    if (!Number.isInteger(id) || id <= 0) {
      return {
        command: null,
        error: `Use: /vault ${lowerAction} <id>`,
      };
    }

    if (lowerAction === "delete") {
      return {
        command: {
          action: "delete",
          id,
        },
      };
    }

    return {
      command: {
        action: "show",
        id,
        reveal: lowerAction === "reveal",
      },
    };
  }

  return {
    command: null,
    error: "Unknown vault command. Use /vault help",
  };
}

async function getDecryptedVaultItems(passphrase: string): Promise<Array<{ record: VaultItemRecord; secret: VaultSecretPayload }>> {
  const records = await getVaultItems();
  const decrypted = await Promise.all(
    records.map(async (record) => ({
      record,
      secret: await decryptVaultPayload(record, passphrase),
    }))
  );

  return decrypted;
}

export default function ChatPage(): JSX.Element {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
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

      const initialThreadId = await loadThreads();
      await loadHistory(initialThreadId);
    })();
  }, [router]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadThreads(preferredThreadId?: string | null): Promise<string | null> {
    setThreadsLoading(true);
    setError(null);

    try {
      const nextThreads = await getChatThreads();
      setThreads(nextThreads);

      let nextActiveThreadId = preferredThreadId ?? activeThreadId;

      if (nextActiveThreadId && !nextThreads.some((thread) => thread.id === nextActiveThreadId)) {
        nextActiveThreadId = null;
      }

      if (!nextActiveThreadId && nextThreads.length > 0) {
        nextActiveThreadId = nextThreads[0].id;
      }

      setActiveThreadId(nextActiveThreadId);
      return nextActiveThreadId;
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Could not load conversations");
      return null;
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadHistory(threadId: string | null): Promise<void> {
    setLoading(true);
    setError(null);

    if (!threadId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const history = await getChatHistory(threadId);
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

    if (content.toLowerCase().startsWith("/vault")) {
      setError(null);
      setSending(true);
      setInput("");

      const userMessage: UiMessage = {
        id: nextMessageId(),
        role: "user",
        content: redactVaultCommand(content),
        created_at: new Date().toISOString(),
      };

      setMessages((current) => [...current, userMessage]);

      const parsed = parseVaultCommand(content);

      try {
        if (!parsed.command) {
          throw new Error(parsed.error || "Invalid vault command");
        }

        const command = parsed.command;

        if (command.action === "help") {
          setMessages((current) => [
            ...current,
            {
              id: nextMessageId(),
              role: "assistant",
              content:
                "Vault commands:\n" +
                "- /vault list\n" +
                "- /vault save <service> | <username> | <password> | [optional notes]\n" +
                "- /vault show <id>\n" +
                "- /vault reveal <id>\n" +
                "- /vault delete <id>\n\n" +
                "Set Vault Passphrase (local) above before using secure commands.",
              created_at: new Date().toISOString(),
            },
          ]);

          return;
        }

        const normalizedPassphrase = vaultPassphrase.trim();
        if (normalizedPassphrase.length < 12) {
          throw new Error("Set a Vault Passphrase (minimum 12 chars) before using secure vault commands.");
        }

        if (command.action === "save") {
          const encrypted = await encryptVaultPayload(
            {
              service: command.service,
              username: command.username,
              password: command.password,
              notes: command.notes,
            },
            normalizedPassphrase
          );

          await createVaultItem(encrypted);

          setMessages((current) => [
            ...current,
            {
              id: nextMessageId(),
              role: "assistant",
              content: `Saved encrypted credential for ${command.service.trim() || "service"}.`,
              created_at: new Date().toISOString(),
            },
          ]);

          return;
        }

        if (command.action === "list") {
          const decrypted = await getDecryptedVaultItems(normalizedPassphrase);

          if (decrypted.length === 0) {
            setMessages((current) => [
              ...current,
              {
                id: nextMessageId(),
                role: "assistant",
                content: "No vault credentials stored yet.",
                created_at: new Date().toISOString(),
              },
            ]);

            return;
          }

          const listText = decrypted
            .slice(0, 20)
            .map((entry) => `${entry.record.id}. ${entry.secret.service} (${entry.secret.username})`)
            .join("\n");

          setMessages((current) => [
            ...current,
            {
              id: nextMessageId(),
              role: "assistant",
              content: `Vault entries:\n${listText}`,
              created_at: new Date().toISOString(),
            },
          ]);

          return;
        }

        if (command.action === "show") {
          const decrypted = await getDecryptedVaultItems(normalizedPassphrase);
          const selected = decrypted.find((entry) => entry.record.id === command.id);

          if (!selected) {
            throw new Error("Vault item not found.");
          }

          const passwordText = command.reveal
            ? selected.secret.password
            : maskSecret(selected.secret.password);

          const response = [
            `Service: ${selected.secret.service}`,
            `Username: ${selected.secret.username}`,
            `Password: ${passwordText}`,
            selected.secret.notes ? `Notes: ${selected.secret.notes}` : "Notes: (none)",
          ].join("\n");

          setMessages((current) => [
            ...current,
            {
              id: nextMessageId(),
              role: "assistant",
              content: response,
              created_at: new Date().toISOString(),
            },
          ]);

          return;
        }

        if (command.action === "delete") {
          await deleteVaultItem(command.id);

          setMessages((current) => [
            ...current,
            {
              id: nextMessageId(),
              role: "assistant",
              content: `Deleted vault credential #${command.id}.`,
              created_at: new Date().toISOString(),
            },
          ]);

          return;
        }
      } catch (requestError: unknown) {
        const message = requestError instanceof Error ? requestError.message : "Vault command failed";
        setError(message);

        setMessages((current) => [
          ...current,
          {
            id: nextMessageId(),
            role: "assistant",
            content: `Vault error: ${message}`,
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }

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
      let resolvedThreadId = activeThreadId;

      await streamChatMessage(
        content,
        (chunk) => {
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
        },
        {
          threadId: activeThreadId,
          onThreadId: (threadId) => {
            resolvedThreadId = threadId;
            setActiveThreadId(threadId);
          },
        }
      );

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

      await loadThreads(resolvedThreadId);
    } catch (requestError: unknown) {
      const message = requestError instanceof Error ? requestError.message : "Failed to stream response";
      setError(message);

      if (/please sign in again/i.test(message)) {
        router.replace("/login");
      }

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
      setThreads([]);
      setActiveThreadId(null);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to clear history");
    } finally {
      setHistoryClearing(false);
    }
  }

  async function handleSelectThread(threadId: string): Promise<void> {
    setActiveThreadId(threadId);
    await loadHistory(threadId);
  }

  function handleNewChat(): void {
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
  }

  return (
    <main className="min-h-screen">
      <Sidebar
        chatThreads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(threadId) => {
          void handleSelectThread(threadId);
        }}
        onNewChat={handleNewChat}
        loadingThreads={threadsLoading}
      />

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 md:ml-[230px] md:px-7 md:pt-6">
        <header className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-xl font-semibold text-keeba-accentLight">Conversations</h1>
            <p className="text-sm text-keeba-textMuted">
              {activeThreadId
                ? "Keeba remembers this conversation context."
                : "Start a new chat from the sidebar or send a first message."}
            </p>
          </div>

          <div className="flex min-w-[260px] flex-col gap-2">
            <label className="text-xs uppercase tracking-[1.3px] text-keeba-textMuted">Vault Passphrase (Local)</label>
            <div className="flex gap-2">
              <input
                type="password"
                minLength={12}
                value={vaultPassphrase}
                onChange={(event) => setVaultPassphrase(event.target.value)}
                placeholder="Used for /vault commands"
                className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setVaultPassphrase("")}
                className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
              >
                Clear
              </button>
            </div>
            <p className="text-[11px] text-keeba-textMuted">Used locally for vault commands and never sent to Keeba AI.</p>
            <button
              type="button"
              disabled={historyClearing}
              onClick={() => void handleClearHistory()}
              className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm text-keeba-textPrimary hover:bg-keeba-card disabled:cursor-not-allowed disabled:opacity-60"
            >
              {historyClearing ? "Clearing..." : "Clear All Chats"}
            </button>
          </div>
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
                <p className="mt-2 text-sm text-keeba-textMuted">
                  {activeThreadId
                    ? "This chat is empty. Ask anything to begin."
                    : "No chat selected. Click New Chat in the sidebar to start."}
                </p>
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
              placeholder="Ask Keeba anything... or type /vault help for secure credential commands"
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
