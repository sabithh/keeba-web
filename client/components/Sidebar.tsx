"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { signOut } from "@/lib/auth";

const navItems = [
  { href: "/chat", label: "Chat" },
  { href: "/files", label: "Files" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

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

        <nav className="mt-6 flex flex-1 flex-col gap-2">
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
