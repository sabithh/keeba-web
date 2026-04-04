"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default function HomePage(): JSX.Element {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      router.replace(user ? "/chat" : "/login");
    })();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="surface-card w-full max-w-md p-8 text-center">
        <p className="keeba-logo text-3xl">keeba</p>
        <p className="mt-4 text-sm text-keeba-textMuted">Preparing your assistant...</p>
      </div>
    </main>
  );
}
