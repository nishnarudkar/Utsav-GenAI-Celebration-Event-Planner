"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import { formatINR, formatINRCompact } from "@/lib/format";
import type { DonutSlice } from "@/lib/plan/dashboard";

/** Fixed colour per slice key: colour follows the category, never its rank. */
const SLICE_COLOR: Record<DonutSlice["key"], string> = {
  catering: "var(--color-series-1)",
  venue: "var(--color-series-2)",
  decor: "var(--color-series-3)",
  attire: "var(--color-series-4)",
  photography: "var(--color-series-5)",
  other: "var(--color-series-other)",
  // Categories that never get their own slice (they fold into "other").
  jewelry: "var(--color-series-other)",
  invites: "var(--color-series-other)",
  music: "var(--color-series-other)",
  transport: "var(--color-series-other)",
  gifts: "var(--color-series-other)",
  priest: "var(--color-series-other)",
  misc: "var(--color-series-other)",
};

interface BudgetDonutProps {
  slices: DonutSlice[];
  totalPaise: number;
}

export function BudgetDonut({ slices, totalPaise }: BudgetDonutProps) {
  if (slices.length === 0) {
    return <p className="text-sm text-muted">No priced items yet — add budget lines or quotes to see the breakdown.</p>;
  }
  const summary = slices.map((s) => `${s.label} ${s.percent}%`).join(", ");

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative size-52 shrink-0" role="img" aria-label={`Budget by category: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="paise"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--color-cream)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={SLICE_COLOR[s.key]} />
              ))}
            </Pie>
            <Tooltip content={SliceTooltip} wrapperStyle={{ outline: "none" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <span className="text-xs text-muted">Estimated</span>
          <span className="font-display text-2xl text-maroon lining-nums">{formatINRCompact(totalPaise)}</span>
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2.5" aria-label="Budget breakdown">
        {slices.map((s) => (
          <li key={s.key} className="flex items-start gap-3 text-sm">
            <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: SLICE_COLOR[s.key] }} aria-hidden />
            <span className="flex-1">
              <span className="text-ink">{s.label}</span>
              {s.members && <span className="block text-xs text-muted">{s.members.join(", ")}</span>}
            </span>
            <span className="text-right tabular-nums text-ink">
              {formatINRCompact(s.paise)}
              <span className="block text-xs text-muted">{s.percent}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SliceTooltip({ active, payload }: TooltipContentProps) {
  const slice = active ? (payload?.[0]?.payload as DonutSlice | undefined) : undefined;
  if (!slice) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-ink">{slice.label}</p>
      <p className="tabular-nums text-muted">
        {formatINR(slice.paise)} · {slice.percent}%
      </p>
    </div>
  );
}
