import { apiFetch } from "../utils/api";

export type AiDocument = {
  id: string;
  original_filename: string;
  file_type: "pdf" | "docx" | "txt" | "markdown";
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  page_count: number | null;
  issue: "ocr_required" | "processing_failed" | null;
  created_at: string;
  processed_at: string | null;
};

export async function listDocuments(): Promise<AiDocument[]> {
  return (await apiFetch<{ documents: AiDocument[] }>("/api/documents")).documents;
}

export async function uploadDocument(file: File): Promise<AiDocument> {
  const body = new FormData();
  body.append("file", file);
  return (await apiFetch<{ document: AiDocument }>("/api/documents", { method: "POST", body })).document;
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
}
