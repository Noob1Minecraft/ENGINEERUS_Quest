import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { PersistenceError } from "./errors";
import {
  IMAGE_BUCKET,
  MAX_IMAGE_CONTEXT_BYTES,
  MAX_IMAGES_PER_REQUEST,
  type NormalizedImage,
} from "../images/imagePolicy";
import type { AiVisionImage } from "../ai/groqClient";
import { securityLogger } from "../security/structuredLogger";

export type ImageStatus = "processing" | "ready" | "failed";
export type ImageRow = {
  id: string;
  user_id: string;
  original_filename: string;
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  size_bytes: number;
  width: number;
  height: number;
  status: ImageStatus;
  storage_path: string;
  failure_code: string | null;
  created_at: string;
  processed_at: string | null;
};

export type PublicImage = Omit<ImageRow, "user_id" | "storage_path" | "failure_code"> & {
  issue: "processing_failed" | null;
};

export type ImageCursor = { createdAt: string; id: string };

const IMAGE_COLUMNS = "id,user_id,original_filename,mime_type,size_bytes,width,height,status,storage_path,failure_code,created_at,processed_at";

function imageFailure(code: string, message: string, status = 503): never {
  throw new PersistenceError(status, code, message);
}

function publicImage(row: ImageRow): PublicImage {
  return {
    id: row.id,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    width: row.width,
    height: row.height,
    status: row.status,
    created_at: row.created_at,
    processed_at: row.processed_at,
    issue: row.failure_code ? "processing_failed" : null,
  };
}

function scoped(admin: SupabaseClient, userId: string, imageId: string) {
  return admin.from("ai_images").select(IMAGE_COLUMNS).eq("id", imageId).eq("user_id", userId);
}

export function createImageRepository(env: ServerEnv) {
  const admin = () => createSupabaseAdminClient(env);

  return {
    async countImages(userId: string): Promise<number> {
      const result = await admin().from("ai_images").select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (result.error) imageFailure("images_unavailable", "Images are temporarily unavailable.");
      return result.count ?? 0;
    },

    async createProcessingImage(input: {
      id: string;
      userId: string;
      image: NormalizedImage;
      storagePath: string;
    }): Promise<ImageRow> {
      const result = await admin().rpc("create_ai_image_upload", {
        p_image_id: input.id,
        p_user_id: input.userId,
        p_original_filename: input.image.displayName,
        p_mime_type: input.image.mimeType,
        p_size_bytes: input.image.buffer.length,
        p_width: input.image.width,
        p_height: input.image.height,
        p_storage_path: input.storagePath,
      }).select(IMAGE_COLUMNS).single();
      if (result.error?.message?.includes("image_quota_exceeded")) {
        imageFailure("image_quota_exceeded", "The 30-image beta limit has been reached.", 409);
      }
      if (result.error) {
        securityLogger.error("image_persistence_failure", { operation: "reserve_upload", database_code: result.error.code });
        imageFailure("image_create_failed", "The image could not be created.");
      }
      return result.data as ImageRow;
    },

    async uploadObject(path: string, image: NormalizedImage): Promise<void> {
      const result = await admin().storage.from(IMAGE_BUCKET).upload(path, image.buffer, {
        contentType: image.mimeType,
        cacheControl: "0",
        upsert: false,
      });
      if (result.error) imageFailure("image_storage_failed", "The image could not be stored.");
    },

    async completeProcessing(userId: string, imageId: string): Promise<PublicImage> {
      const result = await admin().rpc("complete_ai_image_processing", {
        p_user_id: userId,
        p_image_id: imageId,
      }).select(IMAGE_COLUMNS).single();
      if (result.error) imageFailure("image_processing_failed", "The image could not be processed.");
      return publicImage(result.data as ImageRow);
    },

    async markFailed(userId: string, imageId: string, failureCode: string): Promise<void> {
      const result = await admin().from("ai_images").update({
        status: "failed",
        failure_code: failureCode.slice(0, 64),
        processed_at: new Date().toISOString(),
      }).eq("id", imageId).eq("user_id", userId);
      if (result.error) imageFailure("image_processing_failed", "The image could not be processed.");
    },

    async listImages(userId: string, cursor?: ImageCursor, limit = 20): Promise<{ items: PublicImage[]; nextCursor: ImageCursor | null }> {
      let query = admin().from("ai_images").select(IMAGE_COLUMNS).eq("user_id", userId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
      if (cursor) {
        query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
      }
      const result = await query;
      if (result.error) imageFailure("images_unavailable", "Images are temporarily unavailable.");
      const rows = result.data as ImageRow[];
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(publicImage),
        nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null,
      };
    },

    async getImage(userId: string, imageId: string): Promise<PublicImage | null> {
      const result = await scoped(admin(), userId, imageId).maybeSingle();
      if (result.error) imageFailure("images_unavailable", "Images are temporarily unavailable.");
      return result.data ? publicImage(result.data as ImageRow) : null;
    },

    async deleteImage(userId: string, imageId: string): Promise<boolean> {
      const client = admin();
      const found = await scoped(client, userId, imageId).maybeSingle();
      if (found.error) imageFailure("image_delete_failed", "The image could not be deleted.");
      if (!found.data) return false;
      const row = found.data as ImageRow;
      const removed = await client.storage.from(IMAGE_BUCKET).remove([row.storage_path]);
      if (removed.error) imageFailure("image_delete_failed", "The image could not be deleted.");
      const deleted = await client.from("ai_images").delete().eq("id", imageId).eq("user_id", userId);
      if (deleted.error) imageFailure("image_delete_failed", "The image could not be deleted.");
      return true;
    },

    async loadAiImages(userId: string, imageIds: readonly string[]): Promise<AiVisionImage[]> {
      const ids = [...new Set(imageIds)];
      if (ids.length !== imageIds.length || ids.length === 0 || ids.length > MAX_IMAGES_PER_REQUEST) {
        imageFailure("invalid_image_ids", "Between one and three unique image IDs are required.", 400);
      }
      const client = admin();
      const result = await client.from("ai_images").select(IMAGE_COLUMNS)
        .eq("user_id", userId).in("id", ids);
      if (result.error) imageFailure("image_context_unavailable", "Image context is temporarily unavailable.");
      const rows = result.data as ImageRow[];
      if (rows.length !== ids.length) imageFailure("image_not_found", "An image was not found.", 404);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = ids.map((id) => byId.get(id)!);
      if (ordered.some((row) => row.status !== "ready")) imageFailure("image_not_ready", "An image is not ready for AI use.", 409);
      if (ordered.reduce((sum, row) => sum + row.size_bytes, 0) > MAX_IMAGE_CONTEXT_BYTES) {
        imageFailure("image_context_too_large", "The selected images exceed the analysis budget.", 413);
      }

      const images: AiVisionImage[] = [];
      for (const row of ordered) {
        const downloaded = await client.storage.from(IMAGE_BUCKET).download(row.storage_path);
        if (downloaded.error) imageFailure("image_context_unavailable", "Image context is temporarily unavailable.");
        const buffer = Buffer.from(await downloaded.data.arrayBuffer());
        if (buffer.length !== row.size_bytes) imageFailure("image_context_invalid", "The stored image could not be validated.");
        images.push({ id: row.id, mimeType: row.mime_type, buffer });
      }
      return images;
    },
  };
}

export type ImageRepository = ReturnType<typeof createImageRepository>;
