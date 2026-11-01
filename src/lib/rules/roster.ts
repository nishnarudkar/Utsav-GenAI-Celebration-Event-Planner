import { formatClock, formatDate } from "@/lib/format";
import { estimateCrowd } from "@/lib/rules/crowd";
import type { Volunteer, VolunteerRole } from "@/lib/schemas/community";
import type { PlannedFunction } from "@/lib/schemas/event";

/** Who covers each function of a community event (CLAUDE.md F9). Pure, no LLM. */

export const ROLE_LABELS: Record<VolunteerRole, string> = {
  crowd_entry: "Crowd and entry",
  first_aid: "First aid",
  food: "Food",
  stage: "Stage",
  clean_up: "Clean-up",
  general: "General help",
};

export interface ShiftCoverage {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  volunteers: Volunteer[];
  /** From the same rules of thumb as the crowd estimator. */
  volunteersNeeded: number;
  firstAidNeeded: number;
  firstAidHave: number;
}

export interface RosterCoverage {
  shifts: ShiftCoverage[];
  /** Volunteers whose function is no longer in the plan. Shown, so nobody is silently dropped. */
  unplaced: Volunteer[];
}

export function rosterCoverage(
  functions: readonly PlannedFunction[],
  volunteers: readonly Volunteer[],
): RosterCoverage {
  const shifts = functions.map((f) => {
    const assigned = volunteers.filter((v) => v.functionName === f.name);
    const estimate = estimateCrowd({ peakCrowd: f.expectedGuests });
    return {
      name: f.name,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      volunteers: assigned,
      volunteersNeeded: estimate.volunteers,
      firstAidNeeded: estimate.firstAidPosts,
      firstAidHave: assigned.filter((v) => v.role === "first_aid").length,
    };
  });
  const names = new Set(functions.map((f) => f.name));
  return { shifts, unplaced: volunteers.filter((v) => !names.has(v.functionName)) };
}

/** The roster as text for a group chat. Phone numbers stay out, since the group may be large. */
export function rosterText(title: string, { shifts }: RosterCoverage): string {
  const blocks = shifts.map((s) => {
    const heading = `${s.name}, ${formatDate(s.date)}, ${formatClock(s.startTime)} – ${formatClock(s.endTime)}`;
    const people =
      s.volunteers.length > 0 ? s.volunteers.map((v) => `- ${v.name}: ${ROLE_LABELS[v.role]}`) : ["- Nobody yet"];
    return [heading, ...people].join("\n");
  });
  return [`Volunteer roster: ${title}`, ...blocks].join("\n\n");
}
