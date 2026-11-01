import { z } from "zod";

/** Community extras (CLAUDE.md F9): the volunteer roster and the sponsorship pitch. */

export const VolunteerRole = z.enum(["crowd_entry", "first_aid", "food", "stage", "clean_up", "general"]);
export type VolunteerRole = z.infer<typeof VolunteerRole>;

export const VolunteerInput = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 -]{6,18}$/, "Enter a phone number, or leave it blank.")
    .optional(),
  role: VolunteerRole,
  /** The function this shift covers. */
  functionName: z.string().min(1).max(80),
});
export type VolunteerInput = z.infer<typeof VolunteerInput>;
export type Volunteer = VolunteerInput & { id: string };

export const SponsorshipInput = z.object({
  organiser: z.string().trim().min(1).max(80),
  /** How sponsors reach the organisers: a name and phone number, or an email. */
  contact: z.string().trim().min(1).max(80),
  /** ₹1,000 to ₹10Cr. */
  targetPaise: z.number().int().min(1_000_00).max(10_00_00_000_00),
  /** What the money pays for, in the organisers' words. */
  cause: z.string().trim().min(1).max(300),
});
export type SponsorshipInput = z.infer<typeof SponsorshipInput>;

/** Code supplies every figure in the pitch, so the wording mustn't bring its own. */
const Wording = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((text) => !/[0-9₹]/.test(text), "Leave out numbers and amounts; the app adds them.");

/** What the model writes: words only. `composePitch` adds the event details and amounts. */
export const SponsorshipWords = z.object({
  opening: Wording(300),
  perks: z.object({ title: Wording(160), gold: Wording(160), supporter: Wording(160) }),
  closing: Wording(200),
  /** One or two sentences on the approach taken ("Why?"). */
  rationale: z.string().min(1).max(300),
});
export type SponsorshipWords = z.infer<typeof SponsorshipWords>;

export interface SavedSponsorship {
  input: SponsorshipInput;
  words: SponsorshipWords;
}
