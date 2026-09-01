import { extname } from "node:path";

export const DOCUMENT_BUCKET = "engineerus-documents";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 500_000;
export const MAX_PDF_PAGES = 200;
export const MAX_DOCX_ENTRIES = 256;
export const MAX_DOCX_EXPANDED_BYTES = 24 * 1024 * 1024;
export const MAX_DOCX_XML_BYTES = 8 * 1024 * 1024;
export const MAX_CHUNK_CHARACTERS = 3_000;
export const CHUNK_OVERLAP_CHARACTERS = 200;
export const MAX_DOCUMENT_CHUNKS = 180;
export const MAX_RETRIEVED_CHUNKS = 5;
export const MAX_CONTEXT_CHARACTERS = 12_000;
export const PARSER_TIMEOUT_MS = 8_000;
export const MAX_DOCUMENTS_PER_USER = 20;

export type DocumentFileType = "pdf" | "docx" | "txt" | "markdown";

type FileRule = {
  fileType: DocumentFileType;
  mimeTypes: readonly string[];
};

const FILE_RULES: Record<string, FileRule> = {
  ".pdf": { fileType: "pdf", mimeTypes: ["application/pdf"] },
  ".docx": {
    fileType: "docx",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  ".txt": { fileType: "txt", mimeTypes: ["text/plain"] },
  ".md": { fileType: "markdown", mimeTypes: ["text/markdown", "text/plain"] },
  ".markdown": { fileType: "markdown", mimeTypes: ["text/markdown", "text/plain"] },
};

export class DocumentValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

export function normalizeDocumentFilename(input: string): string {
  const normalized = input.normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f]/gu, "");
  if (!normalized || normalized.length > 180) {
    throw new DocumentValidationError("invalid_filename", "The document filename is invalid.");
  }
  if (/[\\/]/u.test(normalized) || normalized === "." || normalized === "..") {
    throw new DocumentValidationError("invalid_filename", "The document filename is invalid.");
  }
  return normalized;
}

export function validateUploadedDocument(input: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): { displayName: string; fileType: DocumentFileType; mimeType: string; extension: string } {
  const displayName = normalizeDocumentFilename(input.originalName);
  if (input.buffer.length === 0) {
    throw new DocumentValidationError("empty_document", "The document is empty.");
  }
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw new DocumentValidationError("document_too_large", "The document exceeds the 10 MB limit.", 413);
  }

  const extension = extname(displayName).toLowerCase();
  const rule = FILE_RULES[extension];
  if (!rule || !rule.mimeTypes.includes(input.mimeType.toLowerCase())) {
    throw new DocumentValidationError("unsupported_document", "Only PDF, DOCX, TXT, and Markdown are supported.");
  }

  if (rule.fileType === "pdf" && input.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new DocumentValidationError("document_signature_mismatch", "The PDF signature is invalid.");
  }
  if (rule.fileType === "docx") {
    const signature = input.buffer.subarray(0, 4);
    if (!(signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04)) {
      throw new DocumentValidationError("document_signature_mismatch", "The DOCX signature is invalid.");
    }
  }
  if ((rule.fileType === "txt" || rule.fileType === "markdown") && looksBinary(input.buffer)) {
    throw new DocumentValidationError("binary_text_rejected", "The text document appears to contain binary data.");
  }

  const canonicalMime = rule.fileType === "markdown" ? "text/markdown" : rule.mimeTypes[0];
  return { displayName, fileType: rule.fileType, mimeType: canonicalMime, extension };
}

export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.01;
}

export function documentStoragePath(userId: string, documentId: string, extension: string): string {
  const safeExtension = extension.replace(/[^a-z0-9.]/gu, "");
  return `${userId}/${documentId}/original${safeExtension}`;
}
