import { Check, Loader2 } from "lucide-react";

export const BUILD_PROGRESS_LABELS = ["Finding your rituals", "Allocating the budget", "Building the timeline", "Creating your checklist"] as const;

interface BuildProgressProps {
  /** Index of the step in progress; steps before it are done. Equal to the length when all are done. */
  activeIndex: number;
}

/** The animated "Building your plan" step list (CLAUDE.md §9). */
export function BuildProgress({ activeIndex }: BuildProgressProps) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <h2 className="font-display text-xl text-maroon">Building your plan</h2>
      <ol className="mt-4 flex flex-col gap-3" aria-live="polite">
        {BUILD_PROGRESS_LABELS.map((label, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={
                  state === "done"
                    ? "flex size-7 items-center justify-center rounded-full bg-saved text-white"
                    : state === "active"
                      ? "flex size-7 items-center justify-center rounded-full bg-marigold-light text-maroon"
                      : "flex size-7 items-center justify-center rounded-full border border-line text-muted"
                }
                aria-hidden
              >
                {state === "done" ? <Check className="size-4" /> : state === "active" ? <Loader2 className="size-4 animate-spin" /> : i + 1}
              </span>
              <span className={state === "pending" ? "text-muted" : "text-ink"}>
                {label}
                <span className="sr-only">{state === "done" ? " — done" : state === "active" ? " — in progress" : " — waiting"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
