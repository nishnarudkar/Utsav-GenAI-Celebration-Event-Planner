import type { Chip } from "@/lib/onboarding/steps";

interface SuggestionChipsProps {
  chips: readonly Chip[];
  onPick: (value: string) => void;
  disabled?: boolean;
  /** Accessible name for the group, e.g. "Suggested answers". */
  label: string;
}

export function SuggestionChips({ chips, onPick, disabled, label }: SuggestionChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip.value)}
          className="rounded-full border border-marigold/60 bg-marigold-light/40 px-4 py-2 text-sm font-medium text-maroon transition-colors hover:bg-marigold-light disabled:opacity-50"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
