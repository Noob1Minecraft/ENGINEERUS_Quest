import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerEnv } from "../config/env";
import { createSupabaseAdminClient } from "../lib/supabaseAdmin";
import { PersistenceError } from "./errors";
import { DOCUMENT_BUCKET } from "../documents/documentPolicy";
import type { DocumentChunkInput, ExtractedDocument } from "../documents/documentExtraction";
import { buildUntrustedDocumentContext, selectRelevantChunks, type RetrievalChunk } from "../documents/documentRetrieval";
import { securityLogger } from "../security/structuredLogger";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";
export type DocumentRow = {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: "pdf" | "docx" | "txt" | "markdown";
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  storage_path: string;
  page_count: number | null;
  failure_code: string | null;
  created_at: string;
  processed_at: string | null;
};

export type PublicDocument = Omit<DocumentRow, "user_id" | "storage_path" | "failure_code"> & {
  issue: "ocr_required" | "processing_failed" | null;
};

const DOCUMENT_COLUMNS = "id,user_id,original_filename,file_type,mime_type,size_bytes,status,storage_path,page_count,failure_code,created_at,processed_at";

function documentFailure(code: string, message: string, status = 503): never {
  throw new PersistenceError(status, code, message);
}

function publicDocument(row: DocumentRow): PublicDocument {
  return {
    id: row.id,
    original_filename: row.original_filename,
    file_type: row.file_type,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    status: row.status,
    page_count: row.page_count,
    created_at: row.created_at,
    processed_at: row.processed_at,
    issue: row.failure_code === "ocr_required" ? "ocr_required" : row.failure_code ? "processing_failed" : null,
  };
}

function scoped(admin: SupabaseClient, userId: string, documentId: string) {
  return admin.from("documents").select(DOCUMENT_COLUMNS).eq("id", documentId).eq("user_id", userId);
}

export function createDocumentRepository(env: ServerEnv) {
  const admin = () => createSupabaseAdminClient(env);

  return {
    async countDocuments(userId: string): Promise<number> {
      const result = await admin().from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (result.error) documentFailure("documents_unavailable", "Documents are temporarily unavailable.");
      return result.count ?? 0;
    },

    async createProcessingDocument(input: Omit<DocumentRow, "created_at" | "processed_at" | "page_count" | "failure_code" | "status">): Promise<DocumentRow> {
      const result = await admin().rpc("create_document_upload", {
        p_document_id: input.id,
        p_user_id: input.user_id,
        p_original_filename: input.original_filename,
        p_file_type: input.file_type,
        p_mime_type: input.mime_type,
        p_size_bytes: input.size_bytes,
        p_storage_path: input.storage_path,
      }).select(DOCUMENT_COLUMNS).single();
      if (result.error?.message?.includes("document_quota_exceeded")) {
        documentFailure("document_quota_exceeded", "The 20-document beta limit has been reached.", 409);
      }
      if (result.error) {
        securityLogger.error("document_persistence_failure", { operation: "reserve_upload", database_code: result.error.code });
        documentFailure("document_create_failed", "The document could not be created.");
      }
      return result.data as DocumentRow;
    },

    async uploadObject(path: string, buffer: Buffer, mimeType: string): Promise<void> {
      const result = await admin().storage.from(DOCUMENT_BUCKET).upload(path, buffer, {
        contentType: mimeType,
        cacheControl: "0",
        upsert: false,
      });
      if (result.error) documentFailure("document_storage_failed", "The document could not be stored.");
    },

    async completeProcessing(
      userId: string,
      documentId: string,
      extracted: ExtractedDocument,
      chunks: readonly DocumentChunkInput[],
    ): Promise<PublicDocument> {
      const result = await admin().rpc("complete_document_processing", {
        p_user_id: userId,
        p_document_id: documentId,
        p_page_count: extracted.pageCount,
        p_chunks: chunks,
      }).select(DOCUMENT_COLUMNS).single();
      if (result.error) {
        securityLogger.error("document_persistence_failure", { operation: "complete_processing", database_code: result.error.code });
        documentFailure("document_processing_failed", "The document could not be processed.");
      }
      return publicDocument(result.data as DocumentRow);
    },

    async markFailed(userId: string, documentId: string, failureCode: string): Promise<void> {
      const result = await admin().from("documents").update({
        status: "failed",
        failure_code: failureCode.slice(0, 64),
        processed_at: new Date().toISOString(),
      }).eq("id", documentId).eq("user_id", userId);
      if (result.error) documentFailure("document_processing_failed", "The document could not be processed.");
    },

    async listDocuments(userId: string): Promise<PublicDocument[]> {
      const result = await admin().from("documents").select(DOCUMENT_COLUMNS)
        .eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20);
      if (result.error) documentFailure("documents_unavailable", "Documents are temporarily unavailable.");
      return (result.data as DocumentRow[]).map(publicDocument);
    },

    async getDocument(userId: string, documentId: string): Promise<PublicDocument | null> {
      const result = await scoped(admin(), userId, documentId).maybeSingle();
      if (result.error) documentFailure("documents_unavailable", "Documents are temporarily unavailable.");
      return result.data ? publicDocument(result.data as DocumentRow) : null;
    },

    async deleteDocument(userId: string, documentId: string): Promise<boolean> {
      const client = admin();
      const found = await scoped(client, userId, documentId).maybeSingle();
      if (found.error) documentFailure("document_delete_failed", "The document could not be deleted.");
      if (!found.data) return false;
      const row = found.data as DocumentRow;
      const removed = await client.storage.from(DOCUMENT_BUCKET).remove([row.storage_path]);
      if (removed.error) documentFailure("document_delete_failed", "The document could not be deleted.");
      const deleted = await client.from("documents").delete().eq("id", documentId).eq("user_id", userId);
      if (deleted.error) documentFailure("document_delete_failed", "The document could not be deleted.");
      return true;
    },

    async loadAiContext(userId: string, documentId: string, question: string): Promise<{ promptBlock: string; systemPolicy: string }> {
      const client = admin();
      const found = await scoped(client, userId, documentId).maybeSingle();
      if (found.error) documentFailure("document_context_unavailable", "Document context is temporarily unavailable.");
      if (!found.data) documentFailure("document_not_found", "The document was not found.", 404);
      const document = found.data as DocumentRow;
      if (document.status !== "ready") documentFailure("document_not_ready", "The document is not ready for AI use.", 409);
      const chunksResult = await client.from("document_chunks").select("ordinal,text,page_number")
        .eq("document_id", documentId).order("ordinal", { ascending: true }).limit(180);
      if (chunksResult.error) documentFailure("document_context_unavailable", "Document context is temporarily unavailable.");
      const selected = selectRelevantChunks(chunksResult.data as RetrievalChunk[], question);
      if (selected.length === 0) documentFailure("document_context_unavailable", "No document context is available.", 409);
      return buildUntrustedDocumentContext(document, selected);
    },
  };
}

export type DocumentRepository = ReturnType<typeof createDocumentRepository>;
