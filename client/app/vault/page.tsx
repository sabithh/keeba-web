"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  createVaultItem,
  deleteVaultItem,
  getVaultItems,
  VaultItemRecord,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  decryptVaultPayload,
  encryptVaultPayload,
  VaultSecretPayload,
} from "@/lib/vaultCrypto";

interface VaultViewItem {
  record: VaultItemRecord;
  secret: VaultSecretPayload;
}

const emptyVaultForm: VaultSecretPayload = {
  service: "",
  username: "",
  password: "",
  notes: "",
};

function maskPassword(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 2)}${"*".repeat(Math.max(6, value.length - 4))}${value.slice(-2)}`;
}

function formatVaultDate(value: string): string {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function decryptItems(
  records: VaultItemRecord[],
  passphrase: string
): Promise<VaultViewItem[]> {
  const decrypted = await Promise.all(
    records.map(async (record) => ({
      record,
      secret: await decryptVaultPayload(record, passphrase),
    }))
  );

  return decrypted;
}

export default function VaultPage(): JSX.Element {
  const router = useRouter();
  const [encryptedItems, setEncryptedItems] = useState<VaultItemRecord[]>([]);
  const [vaultItems, setVaultItems] = useState<VaultViewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [formState, setFormState] = useState<VaultSecretPayload>(emptyVaultForm);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      await loadItems();
    })();
  }, [router]);

  async function loadItems(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const records = await getVaultItems();
      setEncryptedItems(records);

      if (isUnlocked && passphrase) {
        try {
          const decrypted = await decryptItems(records, passphrase);
          setVaultItems(decrypted);
        } catch {
          setIsUnlocked(false);
          setVaultItems([]);
          throw new Error("Vault refresh succeeded, but decrypt failed. Re-enter your passphrase.");
        }
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const normalizedPassphrase = passphrase.trim();
    if (normalizedPassphrase.length < 12) {
      setError("Passphrase must be at least 12 characters.");
      return;
    }

    setUnlocking(true);

    try {
      const decrypted = await decryptItems(encryptedItems, normalizedPassphrase);
      setVaultItems(decrypted);
      setIsUnlocked(true);
      setMessage("Vault unlocked locally. Your passphrase is never stored on the server.");
    } catch {
      setIsUnlocked(false);
      setVaultItems([]);
      setError("Unable to decrypt vault items. Check your passphrase.");
    } finally {
      setUnlocking(false);
    }
  }

  function handleLockVault(): void {
    setError(null);
    setIsUnlocked(false);
    setPassphrase("");
    setVaultItems([]);
    setRevealedPasswords({});
    setMessage("Vault locked.");
  }

  async function handleSaveCredential(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isUnlocked) {
      setError("Unlock the vault first.");
      return;
    }

    setSaving(true);

    try {
      const encrypted = await encryptVaultPayload(formState, passphrase);
      await createVaultItem(encrypted);

      setFormState(emptyVaultForm);
      setRevealedPasswords({});
      await loadItems();
      setMessage("Credential saved with end-to-end encryption.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save credential");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCredential(id: number): Promise<void> {
    setDeletingId(id);
    setError(null);
    setMessage(null);

    try {
      await deleteVaultItem(id);
      setVaultItems((current) => current.filter((entry) => entry.record.id !== id));
      setEncryptedItems((current) => current.filter((entry) => entry.id !== id));
      setMessage("Credential deleted.");
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete credential");
    } finally {
      setDeletingId(null);
    }
  }

  async function copySecret(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied to clipboard.`);
    } catch {
      setError("Clipboard permission denied.");
    }
  }

  function updateForm<K extends keyof VaultSecretPayload>(
    key: K,
    value: VaultSecretPayload[K]
  ): void {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <main className="min-h-screen">
      <Sidebar />

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 md:ml-[230px] md:px-7 md:pt-6">
        <header className="surface-card p-4">
          <h1 className="text-xl font-semibold text-keeba-accentLight">Secure Vault</h1>
          <p className="mt-1 text-sm text-keeba-textMuted">
            Store usernames and passwords encrypted in your browser before they reach the database.
          </p>
          <p className="mt-2 text-xs text-keeba-textMuted">
            Keep your passphrase safe. Without it, encrypted credentials cannot be decrypted.
          </p>
        </header>

        {message ? (
          <p className="mt-4 rounded-item border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <section className="surface-card mt-4 p-4 md:p-5">
          <form onSubmit={handleUnlock} className="grid gap-3 md:grid-cols-[1fr_130px_120px]">
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Vault Passphrase</span>
              <input
                type="password"
                minLength={12}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="At least 12 characters"
                className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={unlocking || loading}
              className="rounded-item border border-keeba-border bg-keeba-accent px-3 py-2 text-sm font-semibold text-keeba-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unlocking ? "Unlocking..." : "Unlock"}
            </button>
            <button
              type="button"
              onClick={handleLockVault}
              disabled={!isUnlocked}
              className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Lock
            </button>
          </form>
        </section>

        <section className="surface-card mt-4 p-4 md:p-5">
          <h2 className="text-lg font-semibold text-keeba-accentLight">Add Credential</h2>
          <p className="mt-1 text-sm text-keeba-textMuted">Data is encrypted locally with AES-256-GCM.</p>

          <form onSubmit={handleSaveCredential} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Service</span>
              <input
                required
                maxLength={100}
                value={formState.service}
                onChange={(event) => updateForm("service", event.target.value)}
                disabled={!isUnlocked || saving}
                placeholder="e.g. Gmail"
                className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Username</span>
              <input
                required
                maxLength={200}
                value={formState.username}
                onChange={(event) => updateForm("username", event.target.value)}
                disabled={!isUnlocked || saving}
                placeholder="email or username"
                className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Password</span>
              <input
                type="password"
                required
                maxLength={512}
                value={formState.password}
                onChange={(event) => updateForm("password", event.target.value)}
                disabled={!isUnlocked || saving}
                className="w-full rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-[1.2px] text-keeba-textMuted">Notes (Optional)</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={formState.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                disabled={!isUnlocked || saving}
                className="w-full rounded-keeba border border-keeba-border bg-keeba-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={!isUnlocked || saving}
                className="rounded-item border border-keeba-border bg-keeba-accent px-4 py-2 text-sm font-semibold text-keeba-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Encrypted Credential"}
              </button>
            </div>
          </form>
        </section>

        <section className="surface-card mt-4 p-4 md:p-5">
          <h2 className="text-lg font-semibold text-keeba-accentLight">Stored Credentials</h2>

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="skeleton h-20" />
              <div className="skeleton h-20" />
              <div className="skeleton h-20" />
            </div>
          ) : !isUnlocked ? (
            <p className="mt-4 rounded-item border border-dashed border-keeba-border px-3 py-4 text-sm text-keeba-textMuted">
              Unlock the vault to decrypt and view saved credentials.
            </p>
          ) : vaultItems.length === 0 ? (
            <p className="mt-4 rounded-item border border-dashed border-keeba-border px-3 py-4 text-sm text-keeba-textMuted">
              No credentials yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {vaultItems.map((entry) => {
                const passwordVisible = Boolean(revealedPasswords[entry.record.id]);
                return (
                  <li key={entry.record.id} className="rounded-keeba border border-keeba-border bg-keeba-primary p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-keeba-accentLight">{entry.secret.service}</p>
                        <p className="text-[11px] uppercase tracking-[1.3px] text-keeba-textMuted">
                          Saved {formatVaultDate(entry.record.created_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteCredential(entry.record.id)}
                        disabled={deletingId === entry.record.id}
                        className="rounded-item border border-keeba-border bg-keeba-card px-3 py-1.5 text-xs text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === entry.record.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-item border border-keeba-border bg-keeba-card p-2 text-xs">
                        <p className="text-[10px] uppercase tracking-[1.4px] text-keeba-textMuted">Username</p>
                        <p className="mt-1 break-all text-sm text-keeba-textPrimary">{entry.secret.username}</p>
                        <button
                          type="button"
                          onClick={() => void copySecret(entry.secret.username, "Username")}
                          className="mt-2 rounded-item border border-keeba-border px-2 py-1 text-[11px]"
                        >
                          Copy Username
                        </button>
                      </div>

                      <div className="rounded-item border border-keeba-border bg-keeba-card p-2 text-xs">
                        <p className="text-[10px] uppercase tracking-[1.4px] text-keeba-textMuted">Password</p>
                        <p className="mt-1 break-all text-sm text-keeba-textPrimary">
                          {passwordVisible ? entry.secret.password : maskPassword(entry.secret.password)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswords((current) => ({
                                ...current,
                                [entry.record.id]: !current[entry.record.id],
                              }))
                            }
                            className="rounded-item border border-keeba-border px-2 py-1 text-[11px]"
                          >
                            {passwordVisible ? "Hide" : "Reveal"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void copySecret(entry.secret.password, "Password")}
                            className="rounded-item border border-keeba-border px-2 py-1 text-[11px]"
                          >
                            Copy Password
                          </button>
                        </div>
                      </div>
                    </div>

                    {entry.secret.notes ? (
                      <div className="mt-3 rounded-item border border-keeba-border bg-keeba-card p-2 text-xs text-keeba-textPrimary">
                        <p className="text-[10px] uppercase tracking-[1.4px] text-keeba-textMuted">Notes</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{entry.secret.notes}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
