import type { Language } from '../types';
import { apiFetch } from "../utils/api";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImageSelection(file: Pick<File, 'type' | 'size'>, lang: Language): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return lang === 'ru' ? 'Выберите изображение JPEG, PNG или WebP.' : lang === 'kk' ? 'JPEG, PNG немесе WebP суретін таңдаңыз.' : 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return lang === 'ru' ? 'Файл больше 8 МиБ. Выберите изображение меньшего размера.' : lang === 'kk' ? 'Файл 8 МиБ-тан үлкен. Кішірек сурет таңдаңыз.' : 'The file is larger than 8 MiB. Choose a smaller image.';
  return null;
}

export type AiImage = {
  id: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  width: number;
  height: number;
  status: "processing" | "ready" | "failed";
  issue: "processing_failed" | null;
  created_at: string;
  processed_at: string | null;
};

export async function listImages(cursor?: string): Promise<{ items: AiImage[]; next_cursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/api/images${query}`);
}

export async function uploadImage(file: File): Promise<AiImage> {
  const body = new FormData();
  body.append("file", file);
  return (await apiFetch<{ image: AiImage }>("/api/images", { method: "POST", body })).image;
}

export async function deleteImage(imageId: string): Promise<void> {
  await apiFetch(`/api/images/${encodeURIComponent(imageId)}`, { method: "DELETE" });
}
