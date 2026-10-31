/**
 * Crowd-safety estimator for community events (CLAUDE.md F9). Pure, no LLM. These are planning
 * rules of thumb, not legal standards; the page says so, and points to the local authorities.
 */

/** People per square metre. Above 4 movement gets hard; around 5 and up, crowds become dangerous. */
const DENSITY = { busy: 2, crowded: 4, unsafe: 5 } as const;
/** About how many people a clear metre of exit lets through per minute, walking on the level. */
const EXIT_FLOW_PER_METRE_PER_MINUTE = 82;
const EVACUATION_MINUTES = 8;
const MIN_EXITS = 2;
/** Small crowds still need real exits, however little width the flow formula asks for. */
const MIN_EXIT_WIDTH_M = 1.5;

const PEOPLE_PER = { volunteer: 100, firstAidPost: 1000, toilet: 150 } as const;

export type CrowdLevel = "comfortable" | "busy" | "crowded" | "unsafe";

export interface CrowdInput {
  peakCrowd: number;
  /** Open space people can stand in, excluding the stage, stalls and kitchens. */
  areaSqM?: number;
  /** Total clear width of all exits. */
  exitWidthM?: number;
}

export interface CrowdEstimate {
  /** Rounded up to the nearest 0.5 m, so it's never understated. */
  exitWidthNeededM: number;
  minExits: number;
  volunteers: number;
  firstAidPosts: number;
  toilets: number;
  /** Only with an area. */
  density?: { perSqM: number; level: CrowdLevel; comfortableCapacity: number };
  /** Metres of exit still needed; only with an exit width. */
  exitShortfallM?: number;
}

function densityLevel(perSqM: number): CrowdLevel {
  if (perSqM >= DENSITY.unsafe) return "unsafe";
  if (perSqM >= DENSITY.crowded) return "crowded";
  if (perSqM >= DENSITY.busy) return "busy";
  return "comfortable";
}

export function estimateCrowd({ peakCrowd, areaSqM, exitWidthM }: CrowdInput): CrowdEstimate {
  const flowWidthM = Math.ceil((peakCrowd / (EXIT_FLOW_PER_METRE_PER_MINUTE * EVACUATION_MINUTES)) * 2) / 2;
  const exitWidthNeededM = Math.max(flowWidthM, MIN_EXITS * MIN_EXIT_WIDTH_M);
  const hasArea = areaSqM !== undefined && areaSqM > 0;
  const perSqM = hasArea ? Math.round((peakCrowd / areaSqM) * 10) / 10 : 0;

  return {
    exitWidthNeededM,
    minExits: MIN_EXITS,
    volunteers: Math.ceil(peakCrowd / PEOPLE_PER.volunteer),
    firstAidPosts: Math.ceil(peakCrowd / PEOPLE_PER.firstAidPost),
    toilets: Math.max(2, Math.ceil(peakCrowd / PEOPLE_PER.toilet)),
    ...(hasArea ? { density: { perSqM, level: densityLevel(peakCrowd / areaSqM), comfortableCapacity: Math.floor(areaSqM * DENSITY.busy) } } : {}),
    ...(exitWidthM !== undefined ? { exitShortfallM: Math.max(0, exitWidthNeededM - exitWidthM) } : {}),
  };
}
