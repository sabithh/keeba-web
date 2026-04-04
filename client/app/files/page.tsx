"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import Sidebar from "@/components/Sidebar";
import { DocumentRecord, deleteFile, getFiles, uploadFile } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export default function FilesPage(): JSX.Element {
  const router = useRouter();
  const [files, setFiles] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      await loadFiles();
    })();
  }, [router]);

  async function loadFiles(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const nextFiles = await getFiles();
      setFiles(nextFiles);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to fetch files");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(
    file: File,
    type: DocumentRecord["type"],
    customType?: string
  ): Promise<void> {
    setUploading(true);
    setError(null);

    try {
      const created = await uploadFile(file, type, customType);
      setFiles((current) => [created, ...current]);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to upload file");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    setError(null);

    try {
      await deleteFile(id);
      setFiles((current) => current.filter((file) => file.id !== id));
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete file");
    }
  }

  return (
    <main className="min-h-screen">
      <Sidebar />

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-4 md:ml-[230px] md:px-7 md:pt-6">
        <header className="surface-card p-4">
          <h1 className="text-xl font-semibold text-keeba-accentLight">Files</h1>
          <p className="text-sm text-keeba-textMuted">
            Upload documents and photos for OCR extraction and smart recall.
          </p>
        </header>

        {error ? (
          <p className="mt-4 rounded-item border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="mt-4">
          <FileUpload onUpload={handleUpload} uploading={uploading} />
        </div>

        <section className="surface-card mt-4 p-4 md:p-5">
          <h2 className="text-lg font-semibold text-keeba-accentLight">Stored Documents</h2>

          {loading ? (
            <div className="mt-4 space-y-3">
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
              <div className="skeleton h-24" />
            </div>
          ) : files.length === 0 ? (
            <div className="mt-5 rounded-keeba border border-dashed border-keeba-border p-8 text-center">
              <p className="keeba-logo text-3xl">keeba</p>
              <p className="mt-2 text-sm text-keeba-textMuted">No documents yet. Upload your first file to begin.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {files.map((file) => (
                <li key={file.id} className="rounded-keeba border border-keeba-border bg-keeba-primary p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-keeba-accentLight">{file.name}</p>
                      <p className="text-xs uppercase tracking-[1.3px] text-keeba-textMuted">
                        {file.type === "other" && file.custom_type ? file.custom_type : file.type}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-[74px] rounded-item border border-keeba-border bg-keeba-card px-3 py-2 text-xs text-center"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => void handleDelete(file.id)}
                        className="min-w-[74px] rounded-item border border-keeba-border bg-keeba-card px-3 py-2 text-xs text-red-200"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-item border border-keeba-border bg-keeba-card p-2 text-xs text-keeba-textPrimary">
                    {file.extracted_text || "No OCR text extracted."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
