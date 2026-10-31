import { z } from "zod";

/** Vibe agent output (CLAUDE.md §7.3, F7): inspiration images and notes become a look for the event. */

export const VibeInput = z.object({ notes: z.string().trim().max(300) });

export const VibeProfile = z.object({
  theme: z.string().min(1).max(60),
  /** One or two sentences on why this look follows from the images and notes ("Why?"). */
  rationale: z.string().min(1).max(300),
  palette: z
    .array(z.object({ name: z.string().min(1).max(40), hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }))
    .min(3)
    .max(6),
  keywords: z.array(z.string().min(1).max(40)).min(3).max(8),
  decor: z.array(z.object({ item: z.string().min(1).max(80), where: z.string().min(1).max(60) })).min(3).max(10),
  attire: z.array(z.string().min(1).max(120)).max(5),
  vendorSearchTerms: z.array(z.string().min(1).max(60)).min(2).max(6),
});
export type VibeProfile = z.infer<typeof VibeProfile>;
