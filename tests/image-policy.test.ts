import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  ImageValidationError,
  MAX_IMAGE_UPLOAD_BYTES,
  imageStoragePath,
  validateAndNormalizeImage,
} from "../server/images/imagePolicy";

async function fixture(format: "jpeg" | "png" | "webp", width = 24, height = 16): Promise<Buffer> {
  const pipeline = sharp({ create: { width, height, channels: 3, background: { r: 245, g: 245, b: 245 } } });
  if (format === "jpeg") return pipeline.jpeg().withMetadata({ orientation: 6 }).toBuffer();
  if (format === "png") return pipeline.png().toBuffer();
  return pipeline.webp().toBuffer();
}

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof ImageValidationError && error.code === code);
}

test("JPEG, PNG, and WebP decode, normalize, orient, and strip metadata", async () => {
  for (const [format, extension, mime] of [
    ["jpeg", "jpg", "image/jpeg"],
    ["png", "png", "image/png"],
    ["webp", "webp", "image/webp"],
  ] as const) {
    const result = await validateAndNormalizeImage({ originalName: `diagram.${extension}`, mimeType: mime, buffer: await fixture(format) });
    assert.equal(result.mimeType, mime);
    assert.ok(result.width > 0 && result.height > 0);
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
  }
});

test("validation rejects extension/MIME/signature mismatches, malformed, empty, SVG, GIF, and traversal names", async () => {
  const jpeg = await fixture("jpeg");
  await expectCode(() => validateAndNormalizeImage({ originalName: "diagram.png", mimeType: "image/png", buffer: jpeg }), "image_signature_mismatch");
  await expectCode(() => validateAndNormalizeImage({ originalName: "diagram.jpg", mimeType: "image/png", buffer: jpeg }), "image_mime_mismatch");
  await expectCode(() => validateAndNormalizeImage({ originalName: "diagram.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }), "invalid_image");
  await expectCode(() => validateAndNormalizeImage({ originalName: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) }), "empty_image");
  await expectCode(() => validateAndNormalizeImage({ originalName: "active.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }), "unsupported_image_format");
  await expectCode(() => validateAndNormalizeImage({ originalName: "animated.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }), "unsupported_image_format");
  const png = await fixture("png");
  await expectCode(() => validateAndNormalizeImage({ originalName: "../diagram.png", mimeType: "image/png", buffer: png }), "invalid_image_filename");
});

test("byte, dimension, and decompression-pixel limits fail closed", async () => {
  await expectCode(() => validateAndNormalizeImage({ originalName: "large.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1, 1) }), "image_too_large");
  const wide = await fixture("png", 6001, 1);
  const bomb = await fixture("png", 5000, 5000);
  await expectCode(() => validateAndNormalizeImage({ originalName: "wide.png", mimeType: "image/png", buffer: wide }), "image_dimensions_too_large");
  await expectCode(() => validateAndNormalizeImage({ originalName: "bomb.png", mimeType: "image/png", buffer: bomb }), "image_pixel_limit");
});

test("storage paths are server-generated and owner namespaced", () => {
  const path = imageStoragePath("a0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000001", "png");
  assert.equal(path, "a0000000-0000-4000-8000-000000000001/images/b0000000-0000-4000-8000-000000000001/normalized.png");
});
