# AI Images H2

H2 adds private, authenticated image analysis to the existing Engineerus AI Tutor. It does not add image generation, public sharing, arbitrary URL fetching, video, a bulk OCR service, CAD reconstruction, dimensional certification, or autonomous engineering approval. The polished attachment composer is deferred to Phase I.

## Provider and request model

The existing Groq primary model, `qwen/qwen3.6-27b`, accepts text and image inputs through the OpenAI-compatible chat-completions API. Groq documents a 20 MB image-bearing request limit and at most three input images. Existing GPT-OSS fallback models are text-only, so vision requests use only the configured Qwen vision model and fail safely instead of falling back to a text-only model. No additional provider or credential is introduced.

The backend accepts only owner-verified `image_ids`. It privately downloads normalized bytes, constructs `data:image/...;base64,...` parts in memory, and sends them directly to Groq. The browser cannot submit an image URL, Storage path, base64 payload, or owner identifier to the AI route. The canonical user text remains unchanged for persistence, language routing, standards guards, idempotency, and XP.

One H1 document and up to three H2 images may be combined. Document retrieval remains capped at five chunks and 12,000 characters. Image context is capped at three unique images and 12 MiB of normalized binary data total, leaving bounded headroom below the provider's 20 MB request limit after base64 encoding and text overhead.

## Supported formats and validation

- JPEG, PNG, and WebP only.
- Maximum inbound image: 8 MiB.
- Maximum source dimensions: 6,000 × 6,000 pixels.
- Maximum source pixel count: 24 megapixels.
- Maximum normalized dimension: 4,096 pixels on either axis; images are never upscaled.
- Maximum normalized stored image: 5 MiB.
- Animated/multi-page images are rejected. GIF, SVG, TIFF, BMP, HEIC, PDF, HTML, and arbitrary binaries are unsupported.

The Express server verifies the safe display filename, extension, declared MIME, magic bytes, Sharp-detected format, a complete decode, dimensions, pixel count, and single-frame status. Sharp 0.35.3 runs with warning-level failure handling, a 24-megapixel decoder limit, and at most four channels. It auto-orients and re-encodes the image in its supported input format. The output does not retain EXIF, XMP, location, device, or other source metadata, and trailing/polyglot data is not copied. JPEG uses quality 90, PNG uses bounded compression, and WebP uses quality 90 to preserve engineering readability without upscaling.

## Storage, metadata, and ownership

H2 uses a dedicated `ai_images` table and reuses the private `engineerus-documents` Storage bucket. Image objects use `<verified-jwt-sub>/images/<server-image-id>/normalized.<extension>`. Separate metadata avoids pretending images have H1 document chunks while reusing the proven private bucket, service-role repository, owner scoping, deletion order, and no-browser-Storage-policy architecture.

`ai_images` stores the authenticated owner, safe original display filename, normalized MIME and size, normalized width and height, processing status, private object path, bounded failure category, and timestamps. RLS permits authenticated users to select only safe metadata columns for their own rows. Browser roles cannot mutate processing state or select `user_id`, `storage_path`, or internal failure categories. Server writes use exact service-role grants and every repository query is scoped by the verified JWT subject.

Upload quota reservation uses a user-scoped transaction advisory lock and rejects the thirty-first image atomically. Public DTOs omit owner IDs, private Storage paths, and parser failure details. The API provides authenticated upload, bounded cursor listing, owner detail, and owner deletion. Direct browser Storage enumeration and mutation remain unavailable.

Owner deletion removes the normalized private object through the Storage API before deleting metadata. If object removal fails, metadata is retained so the object is not silently orphaned. Existing chat text remains after image deletion, but the binary and image metadata are removed.

## Prompt injection and engineering uncertainty

Images are untrusted reference data. The system policy explicitly says visible image text cannot override system policy or response language, request secrets, reveal prompts, alter authorization, or trigger tools, network access, or cloud actions. The model is instructed to use images only for the canonical user question and to ignore irrelevant embedded commands. H1 document context keeps the same untrusted-data treatment when combined with images.

Vision answers must distinguish observed content from inference and unknowns when relevant. They must not claim exact dimensions without a reliable scale, guaranteed material identity from appearance, certified integrity or electrical safety, exact tolerances, or standards compliance from an image alone.

## Quotas, privacy, and logging

- Image uploads: 10 per authenticated user per 15 minutes.
- Vision AI: 10 per authenticated user per 15 minutes, in addition to the existing AI budget and concurrency guard.
- Stored images: 30 per beta user.
- Images per request: 3.
- Image upload itself awards 0 XP. A completed vision exchange uses the existing normal Tutor reward and idempotency path, so one valid exchange awards at most one normal AI reward.

Structured logs may contain request correlation, image ID, MIME category, coarse size bucket, dimensions, processing status, provider/model, duration, and sanitized error category. They never contain image bytes/base64, filenames, visual text, prompts, responses, Storage paths, signed URLs, EXIF, emails, tokens, API keys, or other secrets.

## Safe failure states

The API returns bounded errors for unsupported type, MIME/signature mismatch, malformed or empty input, byte/dimension/pixel limit, animated input, quota exhaustion, missing ownership, non-ready state, oversized combined image context, provider unavailability, timeout/network failure, model rejection, and malformed provider output. Raw parser/provider bodies and credential metadata are never returned.
