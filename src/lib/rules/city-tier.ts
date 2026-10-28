import type { CityTier } from "@/lib/schemas/enums";

/**
 * City → price tier for benchmarks. Loosely based on India's X/Y/Z city classification,
 * plus metro suburbs. Unknown cities default to tier 2 and are flagged so the UI can ask.
 */

const TIER_1 = [
  "mumbai", "bombay", "navi mumbai", "thane",
  "delhi", "new delhi", "gurugram", "gurgaon", "noida", "greater noida", "ghaziabad", "faridabad",
  "bengaluru", "bangalore",
  "kolkata", "calcutta", "howrah",
  "chennai", "madras",
  "hyderabad", "secunderabad",
  "pune",
  "ahmedabad",
];

const TIER_2 = [
  "jaipur", "lucknow", "kochi", "cochin", "chandigarh", "mohali", "indore", "bhopal", "nagpur",
  "surat", "vadodara", "baroda", "rajkot", "coimbatore", "madurai", "tiruchirappalli", "trichy",
  "visakhapatnam", "vizag", "vijayawada", "patna", "bhubaneswar", "cuttack", "guwahati",
  "mysuru", "mysore", "mangaluru", "mangalore", "nashik", "aurangabad", "amritsar", "ludhiana",
  "jalandhar", "kanpur", "agra", "varanasi", "prayagraj", "allahabad", "dehradun", "raipur",
  "ranchi", "jamshedpur", "thiruvananthapuram", "trivandrum", "kozhikode", "calicut", "goa",
  "panaji", "srinagar", "jammu", "udaipur", "jodhpur", "siliguri", "durgapur", "asansol",
];

const TIERS = new Map<string, CityTier>([
  ...TIER_1.map((c) => [c, 1] as const),
  ...TIER_2.map((c) => [c, 2] as const),
]);

export const DEFAULT_CITY_TIER: CityTier = 2;

/** Normalise "  New Delhi, NCR " → "new delhi". Takes the part before the first comma. */
export function normalizeCity(city: string): string {
  return (city.split(",")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityTier(city: string): { tier: CityTier; known: boolean } {
  const tier = TIERS.get(normalizeCity(city));
  return tier ? { tier, known: true } : { tier: DEFAULT_CITY_TIER, known: false };
}
