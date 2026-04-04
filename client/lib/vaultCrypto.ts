export const VAULT_KDF_ALGORITHM = "pbkdf2-sha256";
export const VAULT_KDF_ITERATIONS = 600_000;
export const VAULT_KEY_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface VaultSecretPayload {
  service: string;
  username: string;
  password: string;
  notes: string;
}

export interface VaultEncryptedPayload {
  encrypted_payload: string;
  iv: string;
  salt: string;
  kdf_algorithm: string;
  kdf_iterations: number;
  key_version: number;
}

interface VaultEncryptedSource {
  encrypted_payload: string;
  iv: string;
  salt: string;
  kdf_iterations: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function normalizePayload(input: VaultSecretPayload): VaultSecretPayload {
  const service = input.service.trim().slice(0, 100);
  const username = input.username.trim().slice(0, 200);
  const password = String(input.password ?? "").slice(0, 512);
  const notes = (input.notes ?? "").trim().slice(0, 2000);

  if (!service) {
    throw new Error("Service is required");
  }

  if (!username) {
    throw new Error("Username is required");
  }

  if (!password) {
    throw new Error("Password is required");
  }

  return {
    service,
    username,
    password,
    notes,
  };
}

async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function assertPassphrase(value: string): string {
  const normalized = value.trim();

  if (normalized.length < 12) {
    throw new Error("Passphrase must be at least 12 characters");
  }

  return normalized;
}

export async function encryptVaultPayload(
  payload: VaultSecretPayload,
  passphrase: string,
  iterations = VAULT_KDF_ITERATIONS
): Promise<VaultEncryptedPayload> {
  const normalizedPassphrase = assertPassphrase(passphrase);
  const normalizedPayload = normalizePayload(payload);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(normalizedPassphrase, salt, iterations);

  const plaintext = encoder.encode(JSON.stringify(normalizedPayload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    plaintext
  );

  return {
    encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    kdf_algorithm: VAULT_KDF_ALGORITHM,
    kdf_iterations: iterations,
    key_version: VAULT_KEY_VERSION,
  };
}

export async function decryptVaultPayload(
  source: VaultEncryptedSource,
  passphrase: string
): Promise<VaultSecretPayload> {
  const normalizedPassphrase = assertPassphrase(passphrase);

  const salt = base64ToBytes(source.salt);
  const iv = base64ToBytes(source.iv);
  const ciphertext = base64ToBytes(source.encrypted_payload);

  const key = await deriveVaultKey(normalizedPassphrase, salt, source.kdf_iterations);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(ciphertext)
  );

  const parsed = JSON.parse(decoder.decode(plaintext)) as Partial<VaultSecretPayload>;

  return normalizePayload({
    service: String(parsed.service ?? ""),
    username: String(parsed.username ?? ""),
    password: String(parsed.password ?? ""),
    notes: String(parsed.notes ?? ""),
  });
}
