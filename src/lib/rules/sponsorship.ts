import { formatDate, formatINR } from "@/lib/format";
import { peakCrowdOf } from "@/lib/rules/crowd";
import type { SavedSponsorship, SponsorshipWords } from "@/lib/schemas/community";
import type { PlannedEvent } from "@/lib/schemas/event";

/** Sponsorship tiers and the finished pitch (CLAUDE.md F9). Code owns every figure; the model only supplies wording. */

const ROUND_TO_PAISE = 1_000_00;

const TIERS = [
  { key: "title", name: "Title sponsor", slots: 1, percent: 40 },
  { key: "gold", name: "Gold sponsor", slots: 2, percent: 20 },
  { key: "supporter", name: "Supporter", slots: 4, percent: 5 },
] as const;

export interface SponsorshipTier {
  key: (typeof TIERS)[number]["key"];
  name: string;
  slots: number;
  amountPaise: number;
}

/** Splits the target across 1 + 2 + 4 sponsors, rounding each amount up so a full house meets it. */
export function sponsorshipTiers(targetPaise: number): SponsorshipTier[] {
  return TIERS.map(({ key, name, slots, percent }) => ({
    key,
    name,
    slots,
    amountPaise: Math.ceil((targetPaise * percent) / 100 / ROUND_TO_PAISE) * ROUND_TO_PAISE,
  }));
}

export const tiersTotalPaise = (tiers: readonly SponsorshipTier[]) =>
  tiers.reduce((sum, t) => sum + t.slots * t.amountPaise, 0);

const tierLine = (tier: SponsorshipTier, words: SponsorshipWords) =>
  `• ${tier.name} (${tier.slots === 1 ? "1 place" : `${tier.slots} places`}): ${formatINR(tier.amountPaise)}. ${words.perks[tier.key]}`;

export interface PitchEvent {
  title: string;
  answers: { city: string; startDate: string };
  plan: Pick<PlannedEvent, "functions">;
}

export interface PitchView {
  tiers: SponsorshipTier[];
  totalPaise: number;
  message: string;
  rationale: string;
}

/** Built on read, so a change to the guest count or date always reaches the pitch. */
export function pitchFor(event: PitchEvent, { input, words }: SavedSponsorship): PitchView {
  const tiers = sponsorshipTiers(input.targetPaise);
  const crowd = peakCrowdOf(event.plan.functions).toLocaleString("en-IN");
  const message = [
    words.opening,
    `${event.title}\n${formatDate(event.answers.startDate)}, ${event.answers.city}\nExpected at the busiest time: about ${crowd} people`,
    `What your support pays for: ${input.cause}`,
    `Ways to support:\n${tiers.map((t) => tierLine(t, words)).join("\n")}`,
    words.closing,
    `${input.organiser}\n${input.contact}`,
  ].join("\n\n");
  return { tiers, totalPaise: tiersTotalPaise(tiers), message, rationale: words.rationale };
}
