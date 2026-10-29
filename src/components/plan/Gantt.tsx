import { Moon } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { GanttBar, GanttDay } from "@/lib/plan/timeline-view";

/** CSS-only Gantt of the event's functions (CLAUDE.md §2: no heavy timeline library). */
export function Gantt({ days, bars }: { days: GanttDay[]; bars: GanttBar[] }) {
  if (bars.length === 0) return <p className="text-sm text-muted">No functions scheduled yet.</p>;
  const dayWidth = 100 / days.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Day ruler */}
      <div className="relative ml-0 h-5 text-[11px] text-muted" aria-hidden>
        {days.map((d, i) => (
          <span key={d.date} className="absolute top-0 truncate border-l border-line pl-1" style={{ left: `${i * dayWidth}%`, width: `${dayWidth}%` }}>
            {d.label}
          </span>
        ))}
      </div>

      <ol className="flex flex-col gap-3">
        {bars.map((b) => (
          <li key={`${b.name}-${b.date}`} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{b.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {formatDate(b.date).replace(/ \d{4}$/, "")} · {b.startTime}–{b.endTime}
                {b.overnight && (
                  <span className="ml-1 inline-flex items-center gap-0.5">
                    <Moon className="size-3" aria-hidden />
                    <span className="sr-only">ends</span> next day
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-cream" aria-hidden>
              {days.slice(1).map((d, i) => (
                <span key={d.date} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(i + 1) * dayWidth}%` }} />
              ))}
              <span
                className="absolute inset-y-0 min-w-1.5 rounded-full bg-maroon"
                style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                title={`${b.name}: ${b.startTime}–${b.endTime}`}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
