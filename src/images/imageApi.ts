import { apiFetch } from "../utils/api";

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
