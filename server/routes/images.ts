import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import {
  MAX_IMAGES_PER_USER,
  MAX_IMAGE_UPLOAD_BYTES,
  ImageValidationError,
  imageStoragePath,
  validateAndNormalizeImage,
} from "../images/imagePolicy";
import type { ImageCursor, ImageRepository } from "../persistence/images";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import { securityLogger } from "../security/structuredLogger";

const imageIdSchema = z.string().uuid();
const cursorSchema = z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() });
const listSchema = z.object({ cursor: z.string().max(256).optional() }).strip();
const upload = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
});

function parseSingleFile(request: Request, response: import("express").Response): Promise<Express.Multer.File> {
  return new Promise((resolve, reject) => {
    upload.single("file")(request, response, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          reject(new ImageValidationError("image_too_large", "The image exceeds the 8 MiB limit.", 413));
          return;
        }
        reject(new ImageValidationError("invalid_image_upload", "The image upload could not be parsed."));
        return;
      }
      if (!request.file) {
        reject(new ImageValidationError("missing_image", "An image file is required."));
        return;
      }
      resolve(request.file);
    });
  });
}

function encodeCursor(cursor: ImageCursor | null): string | null {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString("base64url") : null;
}

function decodeCursor(value: string | undefined): ImageCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (parsed.success) return { createdAt: parsed.data.createdAt, id: parsed.data.id };
  } catch {
    // Use one safe public error for malformed opaque cursors.
  }
  throw new ImageValidationError("invalid_image_cursor", "The image cursor is invalid.");
}

function sizeBucket(bytes: number): string {
  if (bytes < 256 * 1024) return "under_256kb";
  if (bytes < 1024 * 1024) return "under_1mb";
  if (bytes < 5 * 1024 * 1024) return "under_5mb";
  return "5mb_to_8mb";
}

export function createImagesRouter(
  authenticate: RequestHandler,
  readRateLimiter: RequestHandler,
  uploadRateLimiter: RequestHandler,
  repository: ImageRepository,
): Router {
  const router = Router();

  router.post("/api/images", authenticate, uploadRateLimiter, async (request, response, next) => {
    const startedAt = Date.now();
    let imageId: string | null = null;
    let userId = "";
    try {
      userId = response.locals.auth.userId;
      if (await repository.countImages(userId) >= MAX_IMAGES_PER_USER) {
        response.status(409).json({ error: { code: "image_quota_exceeded", message: "The 30-image beta limit has been reached." } });
        return;
      }
      const file = await parseSingleFile(request, response);
      const normalized = await validateAndNormalizeImage({
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      imageId = randomUUID();
      const storagePath = imageStoragePath(userId, imageId, normalized.extension);
      await repository.createProcessingImage({ id: imageId, userId, image: normalized, storagePath });
      await repository.uploadObject(storagePath, normalized);
      const image = await repository.completeProcessing(userId, imageId);
      securityLogger.info("image_processed", {
        image_id: imageId,
        mime_category: normalized.format,
        size_bucket: sizeBucket(image.size_bytes),
        width: normalized.width,
        height: normalized.height,
        processing_status: "ready",
        duration_ms: Date.now() - startedAt,
      });
      response.status(201).json({ image });
    } catch (error) {
      if (error instanceof ImageValidationError) {
        if (imageId) await repository.markFailed(userId, imageId, error.code).catch(() => undefined);
        securityLogger.warn("image_processing_rejected", {
          ...(imageId ? { image_id: imageId } : {}),
          processing_status: "failed",
          error_category: error.code,
          duration_ms: Date.now() - startedAt,
        });
        response.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      if (imageId) await repository.markFailed(userId, imageId, "processing_failed").catch(() => undefined);
      if (error instanceof PersistenceError) {
        sendPersistenceError(response, error);
        return;
      }
      next(error);
    }
  });

  router.get("/api/images", authenticate, readRateLimiter, async (request, response) => {
    try {
      const parsed = listSchema.safeParse(request.query);
      if (!parsed.success) throw new ImageValidationError("invalid_image_query", "The image query is invalid.");
      const page = await repository.listImages(response.locals.auth.userId, decodeCursor(parsed.data.cursor));
      response.json({ items: page.items, next_cursor: encodeCursor(page.nextCursor) });
    } catch (error) {
      if (error instanceof ImageValidationError) {
        response.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      if (error instanceof PersistenceError) return sendPersistenceError(response, error);
      throw error;
    }
  });

  router.get("/api/images/:imageId", authenticate, readRateLimiter, async (request, response) => {
    const parsed = imageIdSchema.safeParse(request.params.imageId);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "invalid_image_id", message: "A valid image ID is required." } });
      return;
    }
    try {
      const image = await repository.getImage(response.locals.auth.userId, parsed.data);
      if (!image) {
        response.status(404).json({ error: { code: "image_not_found", message: "The image was not found." } });
        return;
      }
      response.json({ image });
    } catch (error) {
      if (error instanceof PersistenceError) return sendPersistenceError(response, error);
      throw error;
    }
  });

  router.delete("/api/images/:imageId", authenticate, readRateLimiter, async (request, response) => {
    const parsed = imageIdSchema.safeParse(request.params.imageId);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "invalid_image_id", message: "A valid image ID is required." } });
      return;
    }
    try {
      if (!await repository.deleteImage(response.locals.auth.userId, parsed.data)) {
        response.status(404).json({ error: { code: "image_not_found", message: "The image was not found." } });
        return;
      }
      response.status(204).end();
    } catch (error) {
      if (error instanceof PersistenceError) return sendPersistenceError(response, error);
      throw error;
    }
  });

  return router;
}
