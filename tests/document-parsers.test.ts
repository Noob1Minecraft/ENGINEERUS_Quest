import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentChunks, extractDocumentText } from "../server/documents/documentExtraction";
import { DocumentValidationError, MAX_DOCUMENT_CHUNKS, validateUploadedDocument } from "../server/documents/documentPolicy";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Array<[string, string]>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralSize = centrals.reduce((sum, value) => sum + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function docx(text: string, extra: Array<[string, string]> = []): Buffer {
  return zip([
    ["[Content_Types].xml", "<Types></Types>"],
    ["word/document.xml", `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`],
    ...extra,
  ]);
}

function pdf(pageCount: number, text = "Torque formula"): Buffer {
  const content = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const pageIds = Array.from({ length: pageCount }, (_, index) => index + 3);
  const fontId = pageCount + 3;
  const contentId = pageCount + 4;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    ...pageIds.map(() => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function expectCode(action: () => unknown | Promise<unknown>, code: string): Promise<void> {
  return Promise.resolve().then(action).then(
    () => assert.fail(`Expected ${code}`),
    (error: unknown) => assert.equal((error as DocumentValidationError).code, code),
  );
}

test("upload validation accepts exact supported signatures and rejects disguise, binary text, traversal, empty, and oversize", async () => {
  assert.equal(validateUploadedDocument({ originalName: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") }).fileType, "pdf");
  assert.equal(validateUploadedDocument({ originalName: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx("Text") }).fileType, "docx");
  assert.equal(validateUploadedDocument({ originalName: "notes.md", mimeType: "text/plain", buffer: Buffer.from("# Notes") }).mimeType, "text/markdown");
  await expectCode(() => validateUploadedDocument({ originalName: "../evil.txt", mimeType: "text/plain", buffer: Buffer.from("x") }), "invalid_filename");
  await expectCode(() => validateUploadedDocument({ originalName: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ...") }), "document_signature_mismatch");
  await expectCode(() => validateUploadedDocument({ originalName: "evil.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }), "unsupported_document");
  await expectCode(() => validateUploadedDocument({ originalName: "binary.txt", mimeType: "text/plain", buffer: Buffer.from([0, 1, 2]) }), "binary_text_rejected");
  await expectCode(() => validateUploadedDocument({ originalName: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) }), "empty_document");
  await expectCode(() => validateUploadedDocument({ originalName: "large.txt", mimeType: "text/plain", buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 65) }), "document_too_large");
});

test("UTF-8 text and Markdown extraction normalize safely while invalid UTF-8 fails closed", async () => {
  const extracted = await extractDocumentText(Buffer.from("Строка 1\r\n\r\nСтрока 2"), "markdown");
  assert.equal(extracted.pages[0].text, "Строка 1\n\nСтрока 2");
  await expectCode(() => extractDocumentText(Buffer.from([0xc3, 0x28]), "txt"), "invalid_utf8");
});

test("DOCX extraction reads only document XML and rejects malformed, active, excessive-entry, and entity content", async () => {
  const extracted = await extractDocumentText(docx("Крутящий момент"), "docx");
  assert.equal(extracted.pages[0].text, "Крутящий момент");
  await expectCode(() => extractDocumentText(Buffer.from("PK\u0003\u0004broken"), "docx"), "malformed_docx");
  await expectCode(() => extractDocumentText(docx("safe", [["word/vbaProject.bin", "macro"]]), "docx"), "docx_active_content");
  const tooMany = Array.from({ length: 257 }, (_, index) => [`custom/entry-${index}.xml`, "x"] as [string, string]);
  await expectCode(() => extractDocumentText(docx("safe", tooMany), "docx"), "docx_archive_limit");
  await expectCode(() => extractDocumentText(docx("<!DOCTYPE x [<!ENTITY y 'z'>]>&y;"), "docx"), "unsafe_docx_xml");
});

test("PDF extraction handles text, malformed input, page bounds, and scan-only files without OCR", async () => {
  const extracted = await extractDocumentText(pdf(1), "pdf");
  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.pages[0].text, /Torque formula/u);
  await expectCode(() => extractDocumentText(Buffer.from("%PDF-1.7\nnot-a-pdf"), "pdf"), "malformed_pdf");
  await expectCode(() => extractDocumentText(pdf(201), "pdf"), "pdf_page_limit");
  await expectCode(() => extractDocumentText(pdf(1, ""), "pdf"), "ocr_required");
});

test("deterministic chunking is ordered, bounded, overlapping, and deduplicates identical pages", () => {
  const text = `${"engineering ".repeat(280)}END`;
  const chunks = createDocumentChunks({ pages: [{ pageNumber: 1, text }, { pageNumber: 2, text }], pageCount: 2 });
  assert.ok(chunks.length > 1 && chunks.length <= MAX_DOCUMENT_CHUNKS);
  assert.deepEqual(chunks.map((chunk) => chunk.ordinal), chunks.map((_, index) => index));
  assert.ok(chunks.every((chunk) => chunk.text.length <= 3_000));
  assert.equal(new Set(chunks.map((chunk) => chunk.text)).size, chunks.length);
  assert.ok(chunks.some((chunk) => chunk.page_number === 1));
});
