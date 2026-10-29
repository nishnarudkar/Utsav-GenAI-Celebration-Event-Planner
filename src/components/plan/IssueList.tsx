import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type { PlanIssue } from "@/lib/plan/dashboard";

const STYLE: Record<PlanIssue["severity"], { icon: typeof Info; className: string; label: string }> = {
  critical: { icon: AlertOctagon, className: "text-increased", label: "Critical" },
  warn: { icon: AlertTriangle, className: "text-conflict", label: "Warning" },
  info: { icon: Info, className: "text-muted", label: "Note" },
};

/** Severity is carried by icon + label text, never colour alone (CLAUDE.md §9). */
export function IssueList({ issues }: { issues: PlanIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue) => {
        const s = STYLE[issue.severity];
        const Icon = s.icon;
        return (
          <li key={issue.id} className="flex gap-3 rounded-xl border border-line bg-white p-3">
            <Icon className={`mt-0.5 size-5 shrink-0 ${s.className}`} aria-hidden />
            <div className="text-sm">
              <p className="font-medium text-ink">
                <span className="sr-only">{s.label}: </span>
                {issue.title}
              </p>
              <p className="text-muted">{issue.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
