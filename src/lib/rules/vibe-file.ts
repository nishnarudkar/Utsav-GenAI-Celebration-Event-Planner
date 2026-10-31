/** Upload limits for inspiration images, and swatch text colours. Pure and client-safe. */

export const MAX_VIBE_IMAGES = 5;
/** The largest image the vision API accepts. */
export const MAX_VIBE_IMAGE_BYTES = 5 * 1024 * 1024;

export type VibeImageType = "image/jpeg" | "image/png" | "image/webp";

/** WCAG relative luminance of a "#RRGGBB" colour. */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Black or white, whichever reads better on the swatch, so its label always passes contrast. */
export function readableTextOn(hex: string): "#000000" | "#FFFFFF" {
  const l = luminance(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
}
