/**
 * Deterministic task scheduling (CLAUDE.md §7.1 rule 1: dates are computed in code).
 * Turns relative offsets + dependencies into calendar dates, repairing what the model got wrong.
 */

import { formatDate } from "@/lib/format";
import { addDays, diffDays, type ISODate } from "@/lib/rules/dates";
import type { ProposedTask, ScheduledTask } from "@/lib/schemas/timeline";

export interface ScheduleContext {
  /** The main day the offsets are relative to. */
  mainDate: ISODate;
  /** Today on the IST calendar; nothing is scheduled before it. */
  today: ISODate;
  /** Names of planned functions; other functionName values are cleared. */
  functionNames: ReadonlySet<string>;
}

const offsetLabel = (days: number) => (days === 0 ? "the main day" : days < 0 ? `T${days}d` : `T+${days}d`);

/**
 * 1. Drop duplicate refs, unknown/self dependencies, and dependencies that would form a cycle
 *    (checked in input order, so the earlier-listed edge wins).
 * 2. Make every dependency due no later than the tasks that need it, moving dependencies earlier.
 * 3. Resolve offsets to dates; anything ideally due before today is scheduled for today (overdue).
 * Every repair is described in `adjustments`.
 */
export function scheduleTasks(proposed: readonly ProposedTask[], ctx: ScheduleContext): { tasks: ScheduledTask[]; adjustments: string[] } {
  const adjustments: string[] = [];

  // 1a. unique refs
  const seen = new Set<string>();
  const tasks: ProposedTask[] = [];
  for (const t of proposed) {
    if (seen.has(t.ref)) {
      adjustments.push(`Dropped duplicate task id "${t.ref}" ("${t.title}").`);
      continue;
    }
    seen.add(t.ref);
    tasks.push(t);
  }
  const byRef = new Map(tasks.map((t) => [t.ref, t]));

  // 1b. dependencies: known, not self, acyclic
  const deps = new Map<string, string[]>(tasks.map((t) => [t.ref, []]));
  const reaches = (from: string, target: string): boolean => {
    const stack = [from];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === target) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      stack.push(...(deps.get(cur) ?? []));
    }
    return false;
  };
  for (const t of tasks) {
    for (const d of new Set(t.dependsOn)) {
      if (d === t.ref) {
        adjustments.push(`"${t.title}": ignored a dependency on itself.`);
      } else if (!byRef.has(d)) {
        adjustments.push(`"${t.title}": ignored dependency on unknown task "${d}".`);
      } else if (reaches(d, t.ref)) {
        adjustments.push(`"${t.title}": dropped dependency on "${byRef.get(d)?.title}" to avoid a circular dependency.`);
      } else {
        deps.get(t.ref)!.push(d);
      }
    }
  }

  // 2. dependencies must be due no later than their dependents.
  // Visit dependents before their dependencies (reverse topological order).
  const offset = new Map(tasks.map((t) => [t.ref, t.dueOffsetDays]));
  for (const ref of topologicalOrder(tasks.map((t) => t.ref), deps).reverse()) {
    const due = offset.get(ref)!;
    for (const d of deps.get(ref)!) {
      const depDue = offset.get(d)!;
      if (depDue > due) {
        offset.set(d, due);
        adjustments.push(
          `"${byRef.get(d)?.title}" moved from ${offsetLabel(depDue)} to ${offsetLabel(due)} so it's done before "${byRef.get(ref)?.title}".`,
        );
      }
    }
  }

  // 3. dates, clamped to today
  let overdueCount = 0;
  const scheduled = tasks.map((t): ScheduledTask => {
    const idealDueDate = addDays(ctx.mainDate, offset.get(t.ref)!);
    const overdue = diffDays(ctx.today, idealDueDate) < 0;
    if (overdue) overdueCount++;
    let functionName = t.functionName;
    if (functionName !== undefined && !ctx.functionNames.has(functionName)) {
      adjustments.push(`"${t.title}": unknown function "${functionName}", treated as event-wide.`);
      functionName = undefined;
    }
    return {
      ref: t.ref,
      title: t.title,
      ...(t.description ? { description: t.description } : {}),
      ...(t.category ? { category: t.category } : {}),
      ...(functionName ? { functionName } : {}),
      dueDate: overdue ? ctx.today : idealDueDate,
      idealDueDate,
      overdue,
      dependsOn: deps.get(t.ref)!,
      source: "ai",
    };
  });
  if (overdueCount > 0) {
    adjustments.push(
      `${overdueCount} task${overdueCount === 1 ? " was" : "s were"} ideally due before today (${formatDate(ctx.today)}) and ${overdueCount === 1 ? "is" : "are"} scheduled for today.`,
    );
  }

  return { tasks: sortByDue(scheduled), adjustments };
}

/** Kahn's algorithm: dependencies before dependents; ties keep input order. Assumes an acyclic graph. */
export function topologicalOrder(refs: readonly string[], deps: ReadonlyMap<string, readonly string[]>): string[] {
  const pending = new Map(refs.map((r) => [r, new Set(deps.get(r) ?? [])]));
  const order: string[] = [];
  while (pending.size) {
    const ready = [...pending.keys()].find((r) => pending.get(r)!.size === 0);
    if (ready === undefined) throw new Error("Dependency cycle detected");
    order.push(ready);
    pending.delete(ready);
    for (const waiting of pending.values()) waiting.delete(ready);
  }
  return order;
}

/** Stable sort by due date (then input order). */
export function sortByDue<T extends { dueDate: string }>(tasks: readonly T[]): T[] {
  return tasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.dueDate.localeCompare(b.t.dueDate) || a.i - b.i)
    .map(({ t }) => t);
}

export interface RitualPrepFunction {
  name: string;
  date: ISODate;
  /** Items needed across the function's rituals. */
  items: readonly string[];
}

const PREP_LEAD_DAYS = 7;
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50) || "function";

/** One "gather ritual items" task per function with ritual items, a week before it (source: ritual_kb). */
export function ritualPrepTasks(functions: readonly RitualPrepFunction[], today: ISODate): ScheduledTask[] {
  return functions
    .filter((f) => f.items.length > 0)
    .map((f): ScheduledTask => {
      const idealDueDate = addDays(f.date, -PREP_LEAD_DAYS);
      const overdue = diffDays(today, idealDueDate) < 0;
      const shown = f.items.slice(0, 8).join(", ");
      return {
        ref: `prep_${slug(f.name)}`,
        title: `Gather ritual items for ${f.name}`,
        description: f.items.length > 8 ? `${shown}, and ${f.items.length - 8} more` : shown,
        category: "priest",
        functionName: f.name,
        dueDate: overdue ? today : idealDueDate,
        idealDueDate,
        overdue,
        dependsOn: [],
        source: "ritual_kb",
      };
    });
}
