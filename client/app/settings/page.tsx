"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileForm from "@/components/ProfileForm";
import Sidebar from "@/components/Sidebar";
import { Profile, getProfile, updateProfile } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

const emptyProfile: Profile = {
  full_name: "",
  date_of_birth: "",
  phone: "",
  address: "",
  occupation: "",
  about_me: "",
};

export default function SettingsPage(): JSX.Element {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      </section>
    </main>
  );
}
