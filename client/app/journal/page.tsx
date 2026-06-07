"use client";

import { useEffect, useRef, useState } from "react";
import ChatBubble from "@/components/ChatBubble";
import Sidebar from "@/components/Sidebar";
import {
  JournalThread,
  JournalEntry,
  getJournalThreads,
  getJournalEntries,
  createJournalThread,
  addJournalEntry,
  deleteJournalThread,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

export default function JournalPage(): JSX.Element {
  const router = useRouter();

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState(false);

  const [threads, setThreads] = useState<JournalThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);

  const { isListening, toggleListening, hasSupport } = useSpeechRecognition((transcript) => {
    setInput((prev) => (prev ? prev + " " + transcript : transcript));
  });

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }
    })();
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      void loadThreads().then(loadHistory);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  async function loadThreads(preferredThreadId?: string | null): Promise<string | null> {
    setThreadsLoading(true);
    setError(null);
    try {
      const nextThreads = await getJournalThreads();
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
    } catch (err: any) {
      setError(err?.message || "Failed to load journals");
      return null;
    } finally {
      setThreadsLoading(false);
    }
  }

  async function loadHistory(threadId: string | null): Promise<void> {
    setLoading(true);
    setError(null);
    if (!threadId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      const nextEntries = await getJournalEntries(threadId);
      setEntries(nextEntries);
    } catch (err: any) {
      setError(err?.message || "Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEntry(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!input.trim() || saving) return;

    setSaving(true);
    setError(null);
    const content = input.trim();
    setInput("");

    try {
      const { entry, threadId } = await addJournalEntry(activeThreadId, content);
      setEntries((prev) => [...prev, entry]);
      if (threadId !== activeThreadId) {
        await loadThreads(threadId);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to save journal entry");
      setInput(content);
    } finally {
      setSaving(false);
    }
  }

  async function handleNewJournal(): Promise<void> {
    setActiveThreadId(null);
    setEntries([]);
  }

  async function handleDeleteThread(threadId: string): Promise<void> {
    setDeletingThreadId(threadId);
    setError(null);
    try {
      await deleteJournalThread(threadId);
      const remainingThreads = threads.filter((t) => t.id !== threadId);
      setThreads(remainingThreads);
      const nextId = remainingThreads.length > 0 ? remainingThreads[0].id : null;
      setActiveThreadId(nextId);
      await loadHistory(nextId);
    } catch (err: any) {
      setError(err?.message || "Failed to delete journal");
    } finally {
      setDeletingThreadId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-[100dvh]">
        <Sidebar />
        <section className="flex flex-col items-center justify-center p-6 md:ml-[230px] min-h-[100dvh]">
          <form 
            className="surface-card p-6 w-full max-w-sm rounded-[16px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (passcode === "0360") setIsAuthenticated(true);
              else setPasscodeError(true);
            }}
          >
            <h2 className="text-xl font-bold text-keeba-accentLight mb-4">Journal Access</h2>
            <p className="text-keeba-textMuted mb-4">Please enter the passcode to access your journal.</p>
            <input 
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => { setPasscode(e.target.value); setPasscodeError(false); }}
              className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm text-keeba-text mb-4"
            />
            {passcodeError && <p className="text-red-400 text-sm mb-4">Incorrect passcode.</p>}
            <div className="flex gap-2">
              <button 
                type="submit"
                className="flex-1 rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface"
              >
                Unlock
              </button>
              <button 
                type="button"
                onClick={() => { if (passcode === "0360") setIsAuthenticated(true); else setPasscodeError(true); }}
                className="flex-1 rounded-item border border-keeba-border bg-keeba-primary px-4 py-2 text-sm font-semibold text-keeba-text"
              >
                Confirm
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] grid-layout">
      <Sidebar />
      <aside className="border-r border-keeba-border hidden md:flex md:w-[260px] md:flex-col md:ml-[230px]">
        <div className="p-4 border-b border-keeba-border">
          <button
            onClick={() => void handleNewJournal()}
            className="w-full rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface"
          >
            + New Journal
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {threadsLoading ? (
            <p className="text-sm text-keeba-textMuted">Loading journals...</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-keeba-textMuted">No journals yet.</p>
          ) : (
            threads.map((thread) => (
              <div 
                key={thread.id}
                className={"group relative cursor-pointer rounded-item p-3 text-sm transition " + (activeThreadId === thread.id ? "bg-keeba-primaryLight text-keeba-accentLight" : "text-keeba-textMuted hover:bg-keeba-primaryLight")}
                onClick={() => {
                  setActiveThreadId(thread.id);
                  void loadHistory(thread.id);
                }}
              >
                <div className="truncate font-medium">{thread.title}</div>
                <div className="mt-1 text-xs opacity-70">{new Date(thread.updated_at).toLocaleString()}</div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteThread(thread.id); }}
                  disabled={deletingThreadId === thread.id}
                  className="absolute right-2 top-2 hidden rounded-full p-1.5 opacity-60 hover:bg-red-500/20 hover:text-red-400 group-hover:block disabled:cursor-not-allowed"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="flex flex-1 flex-col md:ml-[490px] xl:ml-0 overflow-hidden h-screen bg-keeba-primary/30">
        <header className="border-b border-keeba-border p-4 md:hidden">
          <button
            onClick={() => void handleNewJournal()}
            className="rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface"
          >
            + New Journal
          </button>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:px-8 space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {loading ? (
            <p className="text-sm text-keeba-textMuted text-center">Loading journal entries...</p>
          ) : entries.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="max-w-md text-center text-keeba-textMuted">
                <p>Welcome to your private journal. Start a new entry below.</p>
              </div>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="surface-card p-4 rounded-item">
                <div className="text-xs text-keeba-textMuted mb-2">{new Date(entry.created_at).toLocaleString()}</div>
                <div className="whitespace-pre-wrap text-sm text-keeba-text">{entry.content}</div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleAddEntry} className="border-t border-keeba-border p-4">
          <div className="surface-card flex flex-col gap-3 p-3">
            <div className="flex gap-2 items-start">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="Write your journal entry here..."
                className="flex-1 resize-none rounded-keeba border border-keeba-border bg-keeba-primary px-3 py-2 text-sm text-keeba-text focus:outline-none focus:border-keeba-accent"
              />
              {hasSupport && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={"shrink-0 p-2 rounded-full mt-1 " + (isListening ? "bg-red-500/20 text-red-500" : "bg-keeba-primaryLight text-keeba-textMuted")}
                  title={isListening ? "Stop voice input" : "Start voice input"}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </button>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setInput("")}
                disabled={!input.trim() || saving}
                className="rounded-item border border-keeba-border bg-transparent px-4 py-2 text-sm font-semibold text-keeba-textMuted hover:bg-keeba-primaryLight transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={saving || !input.trim()}
                className="rounded-item border border-keeba-border bg-keeba-accent px-5 py-2 text-sm font-semibold text-keeba-surface hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
