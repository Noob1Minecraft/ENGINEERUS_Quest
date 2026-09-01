import type { Language } from '../types';
import { apiFetch } from "../utils/api";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md', 'markdown']);

export function validateDocumentSelection(file: Pick<File, 'name' | 'size'>, lang: Language): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(extension)) return lang === 'ru' ? 'Выберите PDF, DOCX, TXT или Markdown.' : lang === 'kk' ? 'PDF, DOCX, TXT немесе Markdown таңдаңыз.' : 'Choose a PDF, DOCX, TXT, or Markdown file.';
  if (file.size > MAX_DOCUMENT_BYTES) return lang === 'ru' ? 'Файл больше 10 МБ. Выберите документ меньшего размера.' : lang === 'kk' ? 'Файл 10 МБ-тан үлкен. Кішірек құжат таңдаңыз.' : 'The file is larger than 10 MB. Choose a smaller document.';
  return null;
}

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
