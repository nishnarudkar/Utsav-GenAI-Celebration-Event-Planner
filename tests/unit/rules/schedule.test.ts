import { describe, expect, it } from "vitest";
import { ritualPrepTasks, scheduleTasks, sortByDue, topologicalOrder } from "@/lib/rules/schedule";
import type { ProposedTask } from "@/lib/schemas/timeline";

const CTX = { mainDate: "2027-02-14", today: "2026-10-29", functionNames: new Set(["Biye"]) };

const task = (ref: string, dueOffsetDays: number, dependsOn: string[] = [], over: Partial<ProposedTask> = {}): ProposedTask => ({
  ref,
  title: ref.replace(/_/g, " "),
  dueOffsetDays,
  dependsOn,
  ...over,
});

describe("scheduleTasks", () => {
  it("resolves offsets relative to the main day and sorts by due date", () => {
    const { tasks, adjustments } = scheduleTasks([task("send_invites", -40), task("book_caterer", -100), task("thank_yous", 7)], CTX);
    expect(tasks.map((t) => [t.ref, t.dueDate])).toEqual([
      ["book_caterer", "2026-11-06"],
      ["send_invites", "2027-01-05"],
      ["thank_yous", "2027-02-21"],
    ]);
    expect(tasks.every((t) => t.source === "ai" && !t.overdue)).toBe(true);
    expect(adjustments).toEqual([]);
  });

  it("schedules tasks whose ideal date has passed for today, and says so", () => {
    const { tasks, adjustments } = scheduleTasks([task("book_venue", -150), task("book_photographer", -110)], CTX);
    expect(tasks.map((t) => [t.dueDate, t.idealDueDate, t.overdue])).toEqual([
      ["2026-10-29", "2026-09-17", true],
      ["2026-10-29", "2026-10-27", true],
    ]);
    expect(adjustments).toEqual(["2 tasks were ideally due before today (29 Oct 2026) and are scheduled for today."]);
  });

  it("moves a dependency earlier when it's due after the task that needs it", () => {
    const { tasks, adjustments } = scheduleTasks(
      [task("design_invites", -75, ["book_venue"]), task("book_venue", -60), task("print_invites", -80, ["design_invites"])],
      CTX,
    );
    const due = Object.fromEntries(tasks.map((t) => [t.ref, t.idealDueDate]));
    // print (-80) needs design → design moves to -80; design needs venue → venue moves to -80
    expect(due).toEqual({ print_invites: "2026-11-26", design_invites: "2026-11-26", book_venue: "2026-11-26" });
    expect(adjustments).toEqual([
      '"design invites" moved from T-75d to T-80d so it\'s done before "print invites".',
      '"book venue" moved from T-60d to T-80d so it\'s done before "design invites".',
    ]);
  });

  it("propagates through long chains in one pass", () => {
    const { tasks } = scheduleTasks([task("a", -10), task("b", -20, ["a"]), task("c", -30, ["b"]), task("d", -40, ["c"])], CTX);
    expect(new Set(tasks.map((t) => t.idealDueDate))).toEqual(new Set(["2027-01-05"])); // all at T-40d
  });

  it("drops unknown, self and duplicate dependencies", () => {
    const { tasks, adjustments } = scheduleTasks([task("a", -10, ["a", "ghost", "b", "b"]), task("b", -20)], CTX);
    expect(tasks.find((t) => t.ref === "a")?.dependsOn).toEqual(["b"]);
    expect(adjustments).toEqual(['"a": ignored a dependency on itself.', '"a": ignored dependency on unknown task "ghost".']);
  });

  it("breaks cycles, keeping the earlier-listed dependency", () => {
    const { tasks, adjustments } = scheduleTasks([task("a", -10, ["b"]), task("b", -20, ["c"]), task("c", -30, ["a"])], CTX);
    expect(Object.fromEntries(tasks.map((t) => [t.ref, t.dependsOn]))).toEqual({ a: ["b"], b: ["c"], c: [] });
    expect(adjustments).toEqual(['"c": dropped dependency on "a" to avoid a circular dependency.']);
  });

  it("drops duplicate refs, keeping the first", () => {
    const { tasks, adjustments } = scheduleTasks([task("a", -10, [], { title: "First" }), task("a", -5, [], { title: "Second" })], CTX);
    expect(tasks.map((t) => t.title)).toEqual(["First"]);
    expect(adjustments).toEqual(['Dropped duplicate task id "a" ("Second").']);
  });

  it("clears unknown function names", () => {
    const { tasks, adjustments } = scheduleTasks(
      [task("a", -10, [], { functionName: "Biye" }), task("b", -10, [], { functionName: "Mehendi" })],
      CTX,
    );
    expect(tasks.map((t) => t.functionName)).toEqual(["Biye", undefined]);
    expect(adjustments).toEqual(['"b": unknown function "Mehendi", treated as event-wide.']);
  });
});

describe("topologicalOrder", () => {
  it("puts dependencies first and keeps input order for ties", () => {
    const deps = new Map([["c", ["a"]], ["b", []], ["a", []]]);
    expect(topologicalOrder(["c", "b", "a"], deps)).toEqual(["b", "a", "c"]);
  });

  it("throws on a cycle", () => {
    expect(() => topologicalOrder(["a", "b"], new Map([["a", ["b"]], ["b", ["a"]]]))).toThrow(/cycle/);
  });
});

describe("ritualPrepTasks", () => {
  it("creates one prep task a week before each function with ritual items", () => {
    const items = Array.from({ length: 10 }, (_, i) => `item ${i + 1}`);
    const out = ritualPrepTasks(
      [
        { name: "Biye (wedding ceremony)", date: "2027-02-14", items },
        { name: "Empty", date: "2027-02-14", items: [] },
        { name: "Soon", date: "2026-11-01", items: ["Flowers"] },
      ],
      "2026-10-29",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      ref: "prep_biye_wedding_ceremony",
      title: "Gather ritual items for Biye (wedding ceremony)",
      dueDate: "2027-02-07",
      overdue: false,
      category: "priest",
      functionName: "Biye (wedding ceremony)",
      source: "ritual_kb",
    });
    expect(out[0]?.description).toBe("item 1, item 2, item 3, item 4, item 5, item 6, item 7, item 8, and 2 more");
    expect(out[1]).toMatchObject({ dueDate: "2026-10-29", idealDueDate: "2026-10-25", overdue: true });
  });
});

describe("sortByDue", () => {
  it("is stable for equal dates", () => {
    const out = sortByDue([
      { id: 1, dueDate: "2027-01-02" },
      { id: 2, dueDate: "2027-01-01" },
      { id: 3, dueDate: "2027-01-02" },
    ]);
    expect(out.map((t) => t.id)).toEqual([2, 1, 3]);
  });
});
