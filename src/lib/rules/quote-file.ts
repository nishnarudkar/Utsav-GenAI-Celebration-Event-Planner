/** Upload checks for quote files. Pure and client-safe. */

export const MAX_QUOTE_BYTES = 10 * 1024 * 1024;

export type SniffedMediaType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

/** The file's real type from its first bytes, or null if it isn't a supported format. */
export function sniffMediaType(bytes: Uint8Array): SniffedMediaType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}
