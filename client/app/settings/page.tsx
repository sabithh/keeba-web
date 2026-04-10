"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import Sidebar from "@/components/Sidebar";
import { Profile, TelegramLinkCode, createTelegramLinkCode, getProfile, updateProfile } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const emptyProfile: Profile = {
  full_name: "",
  date_of_birth: "",
  phone: "",
  address: "",
  occupation: "",
  about_me: "",
  custom_instructions: "",
};

export default function SettingsPage(): JSX.Element {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [telegramLink, setTelegramLink] = useState<TelegramLinkCode | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      await loadProfile();
    })();
  }, [router]);

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const current = await getProfile();
      setProfile(
        current
          ? {
              ...emptyProfile,
              ...current,
            }
          : emptyProfile
      );
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(nextProfile: Profile): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await updateProfile(nextProfile);
      setProfile({
        ...emptyProfile,
        ...saved,
      });
      setMessage("Profile updated successfully.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateTelegramLink(): Promise<void> {
    setTelegramLoading(true);
    setTelegramError(null);
    setCopyMessage(null);

    try {
      const linkCode = await createTelegramLinkCode();
      setTelegramLink(linkCode);
      setMessage("Telegram link code generated.");
    } catch (requestError: unknown) {
      setTelegramError(requestError instanceof Error ? requestError.message : "Failed to generate Telegram link code");
    } finally {
      setTelegramLoading(false);
    }
  }

  async function handleCopyStartCommand(): Promise<void> {
    if (!telegramLink) {
      return;
    }

    if (!navigator?.clipboard) {
      setCopyMessage("Clipboard is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(`/start ${telegramLink.code}`);
      setCopyMessage("Copied /start command.");
    } catch {
      setCopyMessage("Unable to copy command. Please copy manually.");
    }
  }

  function formatTelegramExpiry(value: string): string {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString();
  }

  return (
    <main className="min-h-screen">
      <Sidebar />

      <section className="mx-auto max-w-5xl px-4 pb-6 pt-4 md:ml-[230px] md:px-7 md:pt-6">
        <header className="surface-card p-4">
          <h1 className="text-xl font-semibold text-keeba-accentLight">Settings</h1>
          <p className="text-sm text-keeba-textMuted">Keep your personal details updated for better responses.</p>
        </header>

        {message ? (
          <p className="mt-4 rounded-item border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="mt-4">
          {loading ? (
            <div className="surface-card space-y-3 p-5">
              <div className="skeleton h-8 w-1/3" />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="skeleton h-12" />
                <div className="skeleton h-12" />
                <div className="skeleton h-12" />
                <div className="skeleton h-12" />
              </div>
              <div className="skeleton h-24" />
            </div>
          ) : (
            <ProfileForm profile={profile} onSave={handleSave} saving={saving} />
          )}
        </div>

        {!loading ? (
          <section className="surface-card mt-4 p-5">
            <h2 className="text-lg font-semibold text-keeba-accentLight">Connect Telegram Bot</h2>
            <p className="mt-1 text-sm text-keeba-textMuted">
              Generate a one-time code, then message your bot with /start followed by the code.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={telegramLoading}
                onClick={() => {
                  void handleGenerateTelegramLink();
                }}
                className="rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                {telegramLoading ? "Generating..." : "Generate Telegram Link Code"}
              </button>

              <button
                type="button"
                disabled={!telegramLink}
                onClick={() => {
                  void handleCopyStartCommand();
                }}
                className="rounded-item border border-keeba-border bg-keeba-primary px-4 py-2 text-sm font-semibold text-keeba-accentLight disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy /start Command
              </button>
            </div>

            {telegramError ? (
              <p className="mt-3 rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{telegramError}</p>
            ) : null}

            {copyMessage ? (
              <p className="mt-3 rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm text-keeba-textMuted">
                {copyMessage}
              </p>
            ) : null}

            {telegramLink ? (
              <div className="mt-3 space-y-2 rounded-item border border-keeba-border bg-keeba-primary p-3 text-sm">
                <p>
                  <span className="text-keeba-textMuted">Start command:</span> /start {telegramLink.code}
                </p>
                <p>
                  <span className="text-keeba-textMuted">Expires at:</span> {formatTelegramExpiry(telegramLink.expires_at)}
                </p>
                {telegramLink.deep_link ? (
                  <p>
                    <span className="text-keeba-textMuted">Bot deep link:</span>{" "}
                    <a
                      href={telegramLink.deep_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-keeba-accentLight underline"
                    >
                      Open Telegram Bot
                    </a>
                  </p>
                ) : (
                  <p className="text-keeba-textMuted">
                    Add TELEGRAM_BOT_USERNAME in function secrets to receive a clickable deep link here.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
