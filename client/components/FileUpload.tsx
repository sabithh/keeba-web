"use client";

import { useMemo, useState } from "react";
import type { DocumentRecord } from "@/lib/api";

type DocType = DocumentRecord["type"];

interface FileUploadProps {
  onUpload: (file: File, type: DocType) => Promise<void>;
  uploading: boolean;
}

const options: DocType[] = [
  "aadhaar",
  "passport",
  "license",
  "certificate",
  "photo",
  "other",
];

export default function FileUpload({ onUpload, uploading }: FileUploadProps): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>("other");

  const submitDisabled = useMemo(() => uploading || !selectedFile, [uploading, selectedFile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!selectedFile || submitDisabled) {
      return;
    }

    await onUpload(selectedFile, docType);
    setSelectedFile(null);
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card p-4 md:p-5">
      <h2 className="text-lg font-semibold text-keeba-accentLight">Upload Document</h2>
      <p className="mt-1 text-sm text-keeba-textMuted">
        Supported: image files and PDFs. OCR runs automatically after upload.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_120px]">
        <label className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm">
          <span className="mb-2 block text-xs uppercase tracking-[1.3px] text-keeba-textMuted">
            File
          </span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setSelectedFile(picked);
            }}
            className="w-full text-xs file:mr-3 file:rounded-item file:border file:border-keeba-border file:bg-keeba-card file:px-2 file:py-1 file:text-keeba-textPrimary"
          />
        </label>

        <label className="rounded-item border border-keeba-border bg-keeba-primary px-3 py-2 text-sm">
          <span className="mb-2 block text-xs uppercase tracking-[1.3px] text-keeba-textMuted">
            Type
          </span>
          <select
            value={docType}
            onChange={(event) => setDocType(event.target.value as DocType)}
            className="w-full rounded-item border border-keeba-border bg-keeba-card px-2 py-1 text-sm text-keeba-textPrimary"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-item border border-keeba-border bg-keeba-accent px-3 py-2 text-sm font-semibold text-keeba-surface transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </div>
    </form>
  );
}
