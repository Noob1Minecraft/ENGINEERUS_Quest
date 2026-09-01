# AI Documents H1

H1 adds a private, authenticated document-to-AI foundation without OCR, image analysis, public sharing, vector embeddings, or cloud-drive integrations.

## Supported formats and bounds

- PDF (`application/pdf`), DOCX, UTF-8 TXT, and UTF-8 Markdown.
- Maximum upload: 10 MiB per document. Maximum stored documents: 20 per beta user.
- PDF: text-based documents only, at most 200 pages. Image-only/scanned PDFs return an OCR-required failure state.
- DOCX: at most 256 ZIP entries, 24 MiB total expanded size, 8 MiB for `word/document.xml`, and a maximum 100:1 entry compression ratio. Macros, ActiveX, embedded files, unsafe paths, DTDs, and entities are rejected.
- Extracted text: at most 500,000 characters. Parsing has an 8-second deadline with checks throughout page/archive processing.
- Chunks: deterministic 3,000-character maximum, 200-character overlap, at most 180 unique chunks.

The backend validates the filename, extension, declared MIME type, signature, size, UTF-8 encoding, and format structure. User filenames are display metadata only and are never local or Storage paths.

## Ownership and storage

Original files use the private Supabase Storage bucket `engineerus-documents`. The backend creates object paths as `<verified-jwt-sub>/<server-document-id>/original.<extension>` and never accepts an owner or storage path from the client. H1 exposes no public URL, signed URL, direct browser upload, or browser Storage policy. Upload-slot reservation uses a user-scoped transaction advisory lock, so concurrent requests cannot exceed the 20-document quota without granting profile mutation privileges.

`documents` contains private ownership, status, safe metadata, and the internal object path. `document_chunks` contains extracted text. RLS is enabled on both. Authenticated Data API access is limited to safe owner metadata columns; browser roles cannot mutate status or access chunks. Processing uses a narrowly granted service-role repository, and every query is scoped by the verified JWT subject. Public API DTOs omit `user_id`, `storage_path`, and internal parser failure codes.

Deletion first removes the private Storage object through the Storage API and then deletes the owner-scoped document row, which cascades to chunks. A Storage failure leaves the database record intact rather than creating an orphaned billed object.

## Extraction, chunking, and AI retrieval

Extraction is server-only and never fetches external content. PDF.js receives in-memory bytes, does not reconstruct complex layout, and extracts only text items. DOCX traversal reads only `word/document.xml`; other entries are bounded and inspected for unsafe active content but are not executed or expanded to disk. TXT and Markdown are context text only and are never rendered as raw HTML.

When an AI request includes an optional `document_id`, the backend:

1. validates the UUID;
2. verifies ownership and `ready` status;
3. scores the owner's chunks deterministically with bounded lexical overlap;
4. selects at most 5 chunks and at most 12,000 characters;
5. adds the excerpts as a delimited, JSON-encoded untrusted data block.

The canonical user message remains unchanged for persistence and language detection. The entire document is never sent to Groq.

## Prompt-injection treatment

Extracted content is untrusted reference data, not system or user instructions. A separate system policy forbids document content from overriding language or safety policy, requesting secrets, modifying authorization, invoking tools, or triggering network/cloud writes. Delimiters are defense-in-depth only; ownership checks, bounded retrieval, system precedence, existing AI response controls, and deterministic KazStandard safeguards remain authoritative.

## API and abuse controls

- `POST /api/documents` — authenticated multipart upload, 10 uploads per 15 minutes.
- `GET /api/documents` — owner list, capped at 20.
- `GET /api/documents/:id` — owner-safe metadata only.
- `DELETE /api/documents/:id` — owner-only object and metadata deletion.
- Existing document-aware AI requests continue to use the AI rate and concurrency budgets.

Structured logs contain request correlation, document ID, file type, a coarse size bucket, status, bounded chunk count, duration, and failure category. They never contain filenames, document text, extracted chunks, AI context, signed URLs, prompts, tokens, or secrets.

## Beta limitations

H1 has synchronous bounded extraction. It does not provide OCR, images/vision, spreadsheet ingestion, legacy Office formats, arbitrary archives, rich layout reconstruction, semantic embeddings, public sharing, or legal/compliance guarantees. AI summaries and engineering interpretations must be checked against the original document and applicable current requirements.
