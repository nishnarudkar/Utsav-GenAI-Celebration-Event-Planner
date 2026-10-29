/**
 * Guest and venue-capacity rules (CLAUDE.md §7.1 rule 1). Pure functions.
 */

import type { Conflict } from "@/lib/schemas/diff";
import type { PlannedFunction } from "@/lib/schemas/event";

/** Share of capacity from which a venue counts as "nearly full". */
export const NEAR_CAPACITY = 0.9;

/**
 * Apply a new guest count to each function. Functions that had the whole guest list (the
 * ceremony, the reception) follow the new count; smaller ones (close-family rituals) keep
 * their number, capped at the new total.
 */
export function scaleFunctionGuests(functions: readonly PlannedFunction[], fromCount: number, toCount: number): PlannedFunction[] {
  return functions.map((f) => {
    const expectedGuests = f.expectedGuests >= fromCount ? toCount : Math.min(f.expectedGuests, toCount);
    return expectedGuests === f.expectedGuests ? f : { ...f, expectedGuests };
  });
}

/**
 * Scale a guest-driven quantity (plates, return gifts, cards) from one headcount to another,
 * rounding to a whole unit and never below 1.
 */
export function rescaleQuantity(quantity: number, fromGuests: number, toGuests: number): number {
  if (fromGuests <= 0 || fromGuests === toGuests) return quantity;
  return Math.max(1, Math.round((quantity * toGuests) / fromGuests));
}

/** Functions whose expected guests exceed (critical) or nearly fill (warn) the booked venue. */
export function checkVenueCapacity(functions: readonly PlannedFunction[]): Conflict[] {
  const out: Conflict[] = [];
  for (const f of functions) {
    if (!f.venueCapacity) continue;
    if (f.expectedGuests > f.venueCapacity) {
      out.push({
        type: "venue_capacity",
        severity: "critical",
        message: `${f.name}: ${f.expectedGuests} guests expected but the venue holds ${f.venueCapacity}.`,
      });
    } else if (f.expectedGuests >= Math.ceil(f.venueCapacity * NEAR_CAPACITY)) {
      out.push({
        type: "venue_capacity",
        severity: "warn",
        message: `${f.name}: ${f.expectedGuests} of ${f.venueCapacity} seats filled — little room for extra guests.`,
      });
    }
  }
  return out;
}
