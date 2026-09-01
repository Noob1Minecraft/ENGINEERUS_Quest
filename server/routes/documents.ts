import { randomUUID } from "node:crypto";
import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { createDocumentChunks, extractDocumentText } from "../documents/documentExtraction";
import {
  MAX_DOCUMENTS_PER_USER,
  MAX_UPLOAD_BYTES,
  DocumentValidationError,
  documentStoragePath,
  validateUploadedDocument,
} from "../documents/documentPolicy";
import type { DocumentRepository } from "../persistence/documents";
import { PersistenceError, sendPersistenceError } from "../persistence/errors";
import { securityLogger } from "../security/structuredLogger";

const documentIdSchema = z.string().uuid();
const upload = multer({
  storage: multer.memoryStorage(),
  preservePath: true,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
});

function parseSingleFile(request: Request, response: import("express").Response): Promise<Express.Multer.File> {
  return new Promise((resolve, reject) => {
    upload.single("file")(request, response, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          reject(new DocumentValidationError("document_too_large", "The document exceeds the 10 MB limit.", 413));
          return;
        }
        reject(new DocumentValidationError("invalid_upload", "The document upload could not be parsed."));
        return;
      }
      if (!request.file) {
        reject(new DocumentValidationError("missing_document", "A document file is required."));
        return;
      }
      resolve(request.file);
    });
  });
}

function sendDocumentError(response: import("express").Response, error: DocumentValidationError): void {
  response.status(error.status).json({ error: { code: error.code, message: error.message } });
}

function sizeBucket(bytes: number): string {
  if (bytes < 256 * 1024) return "under_256kb";
  if (bytes < 1024 * 1024) return "under_1mb";
  if (bytes < 5 * 1024 * 1024) return "under_5mb";
  return "5mb_to_10mb";
}

export function createDocumentsRouter(
  authenticate: RequestHandler,
  readRateLimiter: RequestHandler,
  uploadRateLimiter: RequestHandler,
  repository: DocumentRepository,
): Router {
  const router = Router();

  router.post("/api/documents", authenticate, uploadRateLimiter, async (request, response, next) => {
    const startedAt = Date.now();
    let documentId: string | null = null;
    let userId = "";
    try {
      userId = response.locals.auth.userId;
      if (await repository.countDocuments(userId) >= MAX_DOCUMENTS_PER_USER) {
        response.status(409).json({
          error: { code: "document_quota_exceeded", message: "The 20-document beta limit has been reached." },
        });
        return;
      }
      const file = await parseSingleFile(request, response);
      const validated = validateUploadedDocument({
        originalName: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      });
      documentId = randomUUID();
      const storagePath = documentStoragePath(userId, documentId, validated.extension);
      await repository.createProcessingDocument({
        id: documentId,
        user_id: userId,
        original_filename: validated.displayName,
        file_type: validated.fileType,
        mime_type: validated.mimeType,
        size_bytes: file.size,
        storage_path: storagePath,
      });
      await repository.uploadObject(storagePath, file.buffer, validated.mimeType);
      const extracted = await extractDocumentText(file.buffer, validated.fileType);
      const chunks = createDocumentChunks(extracted);
      const document = await repository.completeProcessing(userId, documentId, extracted, chunks);
      securityLogger.info("document_processed", {
        document_id: documentId,
        type: validated.fileType,
        size_bucket: sizeBucket(file.size),
        extraction_status: "ready",
        chunk_count: chunks.length,
        parser_duration_ms: Date.now() - startedAt,
      });
      response.status(201).json({ document });
    } catch (error) {
      if (error instanceof DocumentValidationError) {
        if (documentId) await repository.markFailed(userId, documentId, error.code).catch(() => undefined);
        securityLogger.warn("document_processing_rejected", {
          ...(documentId ? { document_id: documentId } : {}),
          extraction_status: "failed",
          failure_category: error.code,
          parser_duration_ms: Date.now() - startedAt,
        });
        sendDocumentError(response, error);
        return;
      }
      if (documentId) await repository.markFailed(userId, documentId, "processing_failed").catch(() => undefined);
      if (error instanceof PersistenceError) {
        sendPersistenceError(response, error);
        return;
      }
      next(error);
    }
  });

  router.get("/api/documents", authenticate, readRateLimiter, async (_request, response) => {
    try {
      response.json({ documents: await repository.listDocuments(response.locals.auth.userId) });
    } catch (error) {
      if (error instanceof PersistenceError) return sendPersistenceError(response, error);
      throw error;
    }
  });

  router.get("/api/documents/:documentId", authenticate, readRateLimiter, async (request, response) => {
    const parsed = documentIdSchema.safeParse(request.params.documentId);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "invalid_document_id", message: "A valid document ID is required." } });
      return;
    }
    try {
      const document = await repository.getDocument(response.locals.auth.userId, parsed.data);
      if (!document) {
        response.status(404).json({ error: { code: "document_not_found", message: "The document was not found." } });
        return;
      }
      response.json({ document });
    } catch (error) {
      if (error instanceof PersistenceError) return sendPersistenceError(response, error);
      throw error;
    }
  });

  router.delete("/api/documents/:documentId", authenticate, readRateLimiter, async (request, response) => {
    const parsed = documentIdSchema.safeParse(request.params.documentId);
    if (!parsed.success) {
      response.status(400).json({ error: { code: "invalid_document_id", message: "A valid document ID is required." } });
      return;
    }
    try {
      const deleted = await repository.deleteDocument(response.locals.auth.userId, parsed.data);
      if (!deleted) {
        response.status(404).json({ error: { code: "document_not_found", message: "The document was not found." } });
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
