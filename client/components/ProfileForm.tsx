"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/api";

interface ProfileFormProps {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void>;
  saving: boolean;
}

export default function ProfileForm({ profile, onSave, saving }: ProfileFormProps): JSX.Element {
  const [formState, setFormState] = useState<Profile>(profile);

  useEffect(() => {
    setFormState(profile);
  }, [profile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSave(formState);
  }

  function updateField<K extends keyof Profile>(key: K, value: Profile[K]): void {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card p-5">
      <h2 className="text-lg font-semibold text-keeba-accentLight">Personal Profile</h2>
      <p className="mt-1 text-sm text-keeba-textMuted">
        Keeba uses this profile to personalize answers and context.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">
            Full Name
          </span>
          <input
            value={formState.full_name ?? ""}
            onChange={(event) => updateField("full_name", event.target.value)}
            className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">
            Date Of Birth
          </span>
          <input
            type="date"
            value={formState.date_of_birth ?? ""}
            onChange={(event) => updateField("date_of_birth", event.target.value)}
            className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">
            Phone
          </span>
          <input
            value={formState.phone ?? ""}
            onChange={(event) => updateField("phone", event.target.value)}
            className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">
            Occupation
          </span>
          <input
            value={formState.occupation ?? ""}
            onChange={(event) => updateField("occupation", event.target.value)}
            className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Address</span>
        <input
          value={formState.address ?? ""}
          onChange={(event) => updateField("address", event.target.value)}
          className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">About Me</span>
        <textarea
          value={formState.about_me ?? ""}
          onChange={(event) => updateField("about_me", event.target.value)}
          rows={5}
          className="w-full rounded-keeba border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
