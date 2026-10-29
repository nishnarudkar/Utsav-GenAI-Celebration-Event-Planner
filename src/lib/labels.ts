import type { BudgetCategory } from "@/lib/schemas/enums";

/** Display names for budget categories (Indian English). */
export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  venue: "Venue",
  catering: "Catering",
  decor: "Décor",
  photography: "Photography",
  attire: "Attire",
  jewelry: "Jewellery",
  invites: "Invitations",
  music: "Music",
  transport: "Transport",
  gifts: "Gifts",
  priest: "Priest & rituals",
  misc: "Miscellaneous",
};
