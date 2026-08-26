import { TextDecoder } from "node:util";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import {
  CHUNK_OVERLAP_CHARACTERS,
  MAX_CHUNK_CHARACTERS,
  MAX_DOCUMENT_CHUNKS,
  MAX_DOCX_ENTRIES,
  MAX_DOCX_EXPANDED_BYTES,
  MAX_DOCX_XML_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MAX_PDF_PAGES,
  PARSER_TIMEOUT_MS,
  DocumentValidationError,
  type DocumentFileType,
} from "./documentPolicy";

export type ExtractedPage = { pageNumber: number | null; text: string };
export type ExtractedDocument = { pages: ExtractedPage[]; pageCount: number | null };
export type DocumentChunkInput = { ordinal: number; text: string; page_number: number | null };

function deadline(): number {
  return Date.now() + PARSER_TIMEOUT_MS;
}

function assertWithinDeadline(expiresAt: number): void {
  if (Date.now() > expiresAt) {
    throw new DocumentValidationError("parser_timeout", "Document extraction timed out.", 422);
  }
}

async function withinDeadline<T>(
  promise: Promise<T>,
  expiresAt: number,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    await onTimeout?.();
    assertWithinDeadline(expiresAt);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          void onTimeout?.();
          reject(new DocumentValidationError("parser_timeout", "Document extraction timed out.", 422));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\u00a0]+/gu, " ")
    .replace(/[ ]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function enforceTextBound(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.length > MAX_EXTRACTED_CHARACTERS) {
    throw new DocumentValidationError("extracted_text_too_large", "The extracted document text is too large.", 422);
  }
  return normalized;
}

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new DocumentValidationError("invalid_utf8", "The text document must be valid UTF-8.");
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Module initialization is trusted server code and may be slow on a cold
    // Render instance. The untrusted-input parsing deadline starts afterward.
    const expiresAt = deadline();
    assertWithinDeadline(expiresAt);
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      stopAtErrors: true,
      useSystemFonts: true,
    });
    const pdf = await withinDeadline(task.promise, expiresAt, () => task.destroy());
    const pageCount = pdf.numPages;
    if (pdf.numPages > MAX_PDF_PAGES) {
      await task.destroy();
      throw new DocumentValidationError("pdf_page_limit", "The PDF exceeds the 200-page limit.", 422);
    }
    const pages: ExtractedPage[] = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      assertWithinDeadline(expiresAt);
      const page = await withinDeadline(pdf.getPage(pageNumber), expiresAt, () => task.destroy());
      const content = await withinDeadline(page.getTextContent(), expiresAt, () => task.destroy());
      const text = normalizeText(content.items
        .map((item) => "str" in item ? item.str : "")
        .join(" "));
      totalCharacters += text.length;
      if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
        await task.destroy();
        throw new DocumentValidationError("extracted_text_too_large", "The extracted document text is too large.", 422);
      }
      if (text) pages.push({ pageNumber, text });
      page.cleanup();
    }
    await task.destroy();
    if (pages.length === 0) {
      throw new DocumentValidationError(
        "ocr_required",
        "Text extraction is unavailable for this image-only PDF. OCR support will come later.",
        422,
      );
    }
    return { pages, pageCount };
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("malformed_pdf", "The PDF could not be safely read.", 422);
  }
}

function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("ZIP unavailable"));
      else resolve(zip);
    });
  });
}

function readZipEntry(zip: ZipFile, entry: Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("ZIP entry unavailable"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) stream.destroy(new Error("ZIP entry limit exceeded"));
        else chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks, total)));
    });
  });
}

function decodeXmlText(xml: string): string {
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) {
    throw new DocumentValidationError("unsafe_docx_xml", "The DOCX contains unsupported XML declarations.", 422);
  }
  return enforceTextBound(xml
    .replace(/<w:tab\b[^>]*\/>/giu, "\t")
    .replace(/<w:br\b[^>]*\/>/giu, "\n")
    .replace(/<\/w:p>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&"));
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const expiresAt = deadline();
  let zip: ZipFile | undefined;
  try {
    zip = await openZip(buffer);
    const documentXml = await withinDeadline(new Promise<Buffer>((resolve, reject) => {
      let entries = 0;
      let expandedBytes = 0;
      let documentContent: Buffer | null = null;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
        zip?.close();
      };
      zip!.once("error", fail);
      zip!.on("entry", async (entry: Entry) => {
        if (settled) return;
        try {
          assertWithinDeadline(expiresAt);
          entries += 1;
          expandedBytes += entry.uncompressedSize;
          if (entries > MAX_DOCX_ENTRIES || expandedBytes > MAX_DOCX_EXPANDED_BYTES) {
            throw new DocumentValidationError("docx_archive_limit", "The DOCX archive exceeds safe expansion limits.", 422);
          }
          if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 100) {
            throw new DocumentValidationError("docx_archive_limit", "The DOCX compression ratio is unsafe.", 422);
          }
          const name = entry.fileName;
          if (name.includes("..") || name.startsWith("/") || name.includes("\\")) {
            throw new DocumentValidationError("unsafe_docx_path", "The DOCX contains an unsafe entry path.", 422);
          }
          if (/\.bin$|vbaProject|activeX|embeddings\//iu.test(name)) {
            throw new DocumentValidationError("docx_active_content", "The DOCX contains unsupported active or embedded content.", 422);
          }
          if (name === "word/document.xml") {
            documentContent = await readZipEntry(zip!, entry, MAX_DOCX_XML_BYTES);
            zip!.readEntry();
            return;
          }
          zip!.readEntry();
        } catch (error) {
          fail(error);
        }
      });
      zip!.once("end", () => {
        if (settled) return;
        if (!documentContent) {
          fail(new Error("DOCX document XML missing"));
          return;
        }
        settled = true;
        resolve(documentContent);
      });
      zip!.readEntry();
    }), expiresAt, () => zip?.close());
    const text = decodeXmlText(decodeUtf8(documentXml));
    if (!text) throw new DocumentValidationError("empty_extracted_text", "No readable text was found in the DOCX.", 422);
    return { pages: [{ pageNumber: null, text }], pageCount: null };
  } catch (error) {
    zip?.close();
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("malformed_docx", "The DOCX could not be safely read.", 422);
  }
}

export async function extractDocumentText(buffer: Buffer, fileType: DocumentFileType): Promise<ExtractedDocument> {
  if (fileType === "pdf") return extractPdf(buffer);
  if (fileType === "docx") return extractDocx(buffer);
  const text = enforceTextBound(decodeUtf8(buffer));
  if (!text) throw new DocumentValidationError("empty_extracted_text", "No readable text was found in the document.", 422);
  return { pages: [{ pageNumber: null, text }], pageCount: null };
}

function splitBounded(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_DOCUMENT_CHUNKS) {
    let end = Math.min(start + MAX_CHUNK_CHARACTERS, text.length);
    if (end < text.length) {
      const naturalBreak = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
      if (naturalBreak > start + Math.floor(MAX_CHUNK_CHARACTERS * 0.65)) end = naturalBreak;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
  }
  if (start < text.length && chunks.length >= MAX_DOCUMENT_CHUNKS) {
    throw new DocumentValidationError("chunk_limit", "The document exceeds safe chunking limits.", 422);
  }
  return chunks;
}

export function createDocumentChunks(extracted: ExtractedDocument): DocumentChunkInput[] {
  const result: DocumentChunkInput[] = [];
  const seen = new Set<string>();
  for (const page of extracted.pages) {
    for (const text of splitBounded(page.text)) {
      if (seen.has(text)) continue;
      seen.add(text);
      result.push({ ordinal: result.length, text, page_number: page.pageNumber });
      if (result.length > MAX_DOCUMENT_CHUNKS) {
        throw new DocumentValidationError("chunk_limit", "The document exceeds safe chunking limits.", 422);
      }
    }
  }
  if (result.length === 0) {
    throw new DocumentValidationError("empty_extracted_text", "No readable text was found in the document.", 422);
  }
  return result;
}
