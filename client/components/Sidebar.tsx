"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ChatThread } from "@/lib/api";
import { signOut } from "@/lib/auth";

const navItems = [
  { href: "/chat", label: "Chat" },
  { href: "/vault", label: "Vault" },
  { href: "/files", label: "Files" },
  { href: "/settings", label: "Settings" },
];

interface SidebarProps {
  chatThreads?: ChatThread[];
  activeThreadId?: string | null;
  onSelectThread?: (threadId: string) => void;
  onNewChat?: () => void;
  loadingThreads?: boolean;
}

function formatThreadTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString();
}

export default function Sidebar({
  chatThreads = [],
  activeThreadId = null,
  onSelectThread,
  onNewChat,
  loadingThreads = false,
}: SidebarProps): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const isChatPage = pathname.startsWith("/chat");

  const title = useMemo(() => {
    const current = navItems.find((item) => pathname.startsWith(item.href));
    return current?.label ?? "Keeba";
  }, [pathname]);

  async function handleLogout(): Promise<void> {
    await signOut();
    router.replace("/login");
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-keeba-border bg-keeba-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="rounded-item border border-keeba-border px-3 py-2 text-sm"
        >
          Menu
        </button>
        <p className="keeba-logo text-xl">keeba</p>
        <span className="text-xs uppercase tracking-[2px] text-keeba-textMuted">{title}</span>
      </header>

      {isOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-20 bg-black/45 md:hidden"
        />
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-30 flex h-screen w-[230px] flex-col border-r border-keeba-border bg-keeba-surface px-4 py-5 transition-transform duration-300 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-keeba-border pb-4">
          <p className="keeba-logo text-[30px] leading-none">keeba</p>
          <p className="mt-2 text-xs uppercase tracking-[2px] text-keeba-textMuted">personal ai</p>
        </div>

        <nav className="mt-6 flex flex-col gap-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`nav-item px-3 py-2 text-sm ${active ? "nav-item-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isChatPage ? (
          <section className="mt-4 flex flex-1 flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => {
                onNewChat?.();
                setIsOpen(false);
              }}
              className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm font-semibold text-keeba-accentLight hover:bg-keeba-card"
            >
              + New Chat
            </button>

            <p className="mt-4 text-[11px] uppercase tracking-[1.8px] text-keeba-textMuted">Recent chats</p>

            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
              {loadingThreads ? (
                <>
                  <div className="skeleton h-14" />
                  <div className="skeleton h-14" />
                  <div className="skeleton h-14" />
                </>
              ) : chatThreads.length === 0 ? (
                <p className="rounded-item border border-dashed border-keeba-border px-3 py-3 text-xs text-keeba-textMuted">
                  No conversations yet.
                </p>
              ) : (
                chatThreads.map((thread) => {
                  const active = activeThreadId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => {
                        onSelectThread?.(thread.id);
                        setIsOpen(false);
                      }}
                      className={`w-full rounded-item border px-3 py-2 text-left transition ${
                        active
                          ? "border-keeba-borderAccent bg-keeba-primary text-keeba-accentLight"
                          : "border-keeba-border bg-transparent text-keeba-textPrimary hover:bg-keeba-card"
                      }`}
                    >
                      <p className="truncate text-sm font-medium">{thread.title || "Untitled chat"}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[1.5px] text-keeba-textMuted">
                        {formatThreadTime(thread.last_message_at)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : (
          <div className="flex-1" />
        )}

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-item border border-keeba-border bg-transparent px-3 py-2 text-sm text-keeba-textPrimary hover:bg-keeba-card"
        >
          Logout
        </button>
      </aside>
    </>
  );
}
