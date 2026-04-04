"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

type AuthMode = "login" | "register";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (user) {
        router.replace("/chat");
      }
    })();
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }

      router.replace("/chat");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-20 top-6 h-56 w-56 rounded-full bg-[#94897933] blur-3xl" />
      <div className="pointer-events-none absolute bottom-6 right-0 h-64 w-64 rounded-full bg-[#393E4630] blur-3xl" />

      <section className="surface-card w-full max-w-md p-7 md:p-8">
        <p className="keeba-logo text-4xl leading-none">keeba</p>
        <p className="mt-2 text-sm text-keeba-textMuted">Your personal AI companion with memory and document context.</p>

        <div className="mt-5 flex rounded-item border border-keeba-border bg-keeba-primary p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`w-1/2 rounded-item px-3 py-2 text-sm ${
              mode === "login" ? "bg-keeba-card text-keeba-accentLight" : "text-keeba-textMuted"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`w-1/2 rounded-item px-3 py-2 text-sm ${
              mode === "register" ? "bg-keeba-card text-keeba-accentLight" : "text-keeba-textMuted"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
            />
          </label>

          {error ? (
            <p className="rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "login" ? "Enter Keeba" : "Create Account"}
          </button>
        </form>
      </section>
    </main>
  );
}
