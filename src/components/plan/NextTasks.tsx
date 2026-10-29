import { Clock } from "lucide-react";
import { formatDate } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { ScheduledTask } from "@/lib/schemas/timeline";

export function NextTasks({ tasks, today }: { tasks: ScheduledTask[]; today: string }) {
  if (tasks.length === 0) return <p className="text-sm text-muted">Nothing left to do — enjoy the celebration!</p>;
  return (
    <ol className="flex flex-col divide-y divide-line">
      {tasks.map((t) => {
        const dueNow = t.dueDate <= today;
        const meta = [t.category ? CATEGORY_LABELS[t.category] : null, t.functionName ?? null].filter(Boolean).join(" · ");
        return (
          <li key={t.ref} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <span className="text-ink">{t.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {dueNow ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-conflict/10 px-2 py-0.5 font-medium text-conflict">
                  <Clock className="size-3" aria-hidden /> Due now
                  {t.overdue && <span className="font-normal"> · ideally by {formatDate(t.idealDueDate)}</span>}
                </span>
              ) : (
                <span>Due {formatDate(t.dueDate)}</span>
              )}
              {meta && <span>{meta}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
