import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as ask } from "@/app/api/events/[id]/assistant/route";
import { POST as createDemo } from "@/app/api/demo/route";
import { askAssistant, messageSlug } from "@/lib/ai/agents/assistant";
import { assistantContext, describeChange, fillPlaceholders, finalizeAssistant, resolveChange } from "@/lib/plan/assistant-view";
import type { StoredEvent } from "@/lib/plan/types";
import { ASSISTANT_SUGGESTIONS, AssistantDraft, AssistantRequest, type AssistantChange } from "@/lib/schemas/assistant";

const TODAY = "2026-11-01";
const rupees = (r: number) => r * 100;

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown) => ask(new Request("http://test", { method: "POST", body: JSON.stringify(body) }), params(id));
const newEvent = async () => ((await (await createDemo()).json()) as { event: StoredEvent }).event;
const change = (over: Partial<AssistantChange> & Pick<AssistantChange, "field">): AssistantChange => ({ op: "set", amount: null, text: null, ...over });
const answer = (reply: string): AssistantDraft => ({ intent: "answer", reply, change: null, tool: null });

let event: StoredEvent;

beforeEach(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  event = await newEvent();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveChange", () => {
  const value = (request: AssistantChange) => {
    const result = resolveChange(request, event);
    return "change" in result ? result.change.value : result.problem;
  };

  it("works out guests from the current plan", () => {
    expect(value(change({ field: "guest_count", amount: 300 }))).toBe(300);
    expect(value(change({ field: "guest_count", op: "add", amount: 100 }))).toBe(350);
    expect(value(change({ field: "guest_count", op: "add", amount: -50 }))).toBe(200);
    expect(value(change({ field: "guest_count", op: "percent", amount: 10 }))).toBe(275);
  });

  it("works out budgets in whole rupees, stored as paise", () => {
    expect(value(change({ field: "budget_total", amount: 12_00_000 }))).toBe(rupees(12_00_000));
    expect(value(change({ field: "budget_total", op: "add", amount: 50_000 }))).toBe(rupees(15_50_000));
    expect(value(change({ field: "budget_total", op: "percent", amount: -20 }))).toBe(rupees(12_00_000));
  });

  it("moves or sets the date", () => {
    expect(value(change({ field: "start_date", op: "add", amount: 7 }))).toBe("2027-02-21");
    expect(value(change({ field: "start_date", text: "2027-03-01" }))).toBe("2027-03-01");
  });

  it("sets the city", () => {
    expect(value(change({ field: "city", text: "Pune" }))).toBe("Pune");
  });

  it.each([
    [change({ field: "guest_count", op: "add", amount: -1000 }), /between 1 and 5,000/],
    [change({ field: "guest_count", amount: 9000 }), /between 1 and 5,000/],
    [change({ field: "budget_total", op: "percent", amount: -100 }), /no budget/],
    [change({ field: "start_date", text: "next Friday" }), /didn't quite catch/],
    [change({ field: "city", op: "add", amount: 1 }), /didn't quite catch/],
    [change({ field: "guest_count" }), /didn't quite catch/],
  ])("explains a request it can't carry out", (request, problem) => {
    expect(value(request)).toMatch(problem);
  });

  it("copes with no change at all", () => {
    expect(resolveChange(null, event)).toMatchObject({ problem: expect.stringMatching(/didn't quite catch/) });
  });
});

describe("describeChange", () => {
  it("shows the before and after", () => {
    expect(describeChange({ field: "guest_count", value: 350 }, event)).toBe("Guests: 250 → 350");
    expect(describeChange({ field: "budget_total", value: rupees(12_00_000) }, event)).toBe("Budget: ₹15L → ₹12L");
    expect(describeChange({ field: "start_date", value: "2027-02-21" }, event)).toBe("Main day: 14 Feb 2027 → 21 Feb 2027");
    expect(describeChange({ field: "city", value: "Pune" }, event)).toBe("City: Kolkata → Pune");
  });
});

describe("fillPlaceholders", () => {
  it("uses the plan's real figures", () => {
    const left = event.budget.budgetTotalPaise - event.budget.totalEstimatePaise;
    expect(fillPlaceholders("{guest_count} in {city} on {main_day}", event, TODAY)).toBe("250 in Kolkata on 14 Feb 2027");
    expect(fillPlaceholders("{budget_position}", event, TODAY)).toMatch(/^₹[\d,]+ left$/);
    expect(left).toBeGreaterThan(0);
    expect(fillPlaceholders("{spend:catering}", event, TODAY)).toMatch(/^₹[\d,]+$/);
  });

  it("says so when the plan is over budget", () => {
    const over = { ...event, budget: { ...event.budget, budgetTotalPaise: rupees(1_00_000) } };
    expect(fillPlaceholders("{budget_position}", over, TODAY)).toMatch(/ over budget$/);
  });

  it("lists tasks with their dates", () => {
    expect(fillPlaceholders("{next_tasks}", event, TODAY)).toMatch(/\(by \d+ \w+ \d{4}\)/);
  });
});

describe("AssistantDraft", () => {
  it.each(["You have ₹5 lakh left.", "There are 250 guests.", "Your {guest_total} is fine."])("rejects figures the model wrote itself: %s", (reply) => {
    expect(AssistantDraft.safeParse(answer(reply)).success).toBe(false);
  });

  it("accepts placeholders", () => {
    expect(AssistantDraft.safeParse(answer("You have {budget_position}, and {spend:catering} goes on food.")).success).toBe(true);
  });
});

describe("AssistantRequest", () => {
  it("limits message and history length", () => {
    expect(AssistantRequest.safeParse({ message: "x".repeat(301) }).success).toBe(false);
    expect(AssistantRequest.safeParse({ message: " " }).success).toBe(false);
    expect(AssistantRequest.safeParse({ message: "hi", history: Array(7).fill({ role: "user", text: "x" }) }).success).toBe(false);
  });
});

describe("finalizeAssistant", () => {
  const finalize = (draft: AssistantDraft, plan = event) => finalizeAssistant(draft, plan, "id-1", TODAY);

  it("proposes a change without making it", () => {
    const response = finalize({ intent: "change_plan", reply: "I can do that.", change: change({ field: "guest_count", op: "add", amount: 100 }), tool: null });
    expect(response.action).toEqual({ type: "change", change: { field: "guest_count", value: 350 }, label: "Guests: 250 → 350" });
  });

  it("replaces an unusable proposal with the reason", () => {
    expect(finalize({ intent: "change_plan", reply: "Done!", change: null, tool: null })).toEqual({ reply: expect.stringMatching(/didn't quite catch/), action: null });
  });

  it("doesn't propose a change to the same value", () => {
    expect(finalize({ intent: "change_plan", reply: "Sure.", change: change({ field: "guest_count", amount: 250 }), tool: null })).toEqual({ reply: expect.stringMatching(/already what the plan says/), action: null });
  });

  it("links to a tool", () => {
    expect(finalize({ intent: "open_tool", reply: "Try this.", change: null, tool: "council" }).action).toEqual({ type: "open", href: "/events/id-1/council", label: "Open Family Council" });
  });

  it("doesn't link to community tools on other events", () => {
    expect(finalize({ intent: "open_tool", reply: "Try this.", change: null, tool: "community" }).action).toBeNull();
  });
});

describe("assistantContext", () => {
  it("gives the model structure but no amounts", () => {
    const context = assistantContext(event, TODAY);
    expect(context).toContain("Aashirbaad");
    expect(context).toContain("spend:catering");
    expect(context).not.toMatch(/₹/);
  });
});

describe("askAssistant", () => {
  it("includes recent turns, and treats the message as data", async () => {
    const structured = vi.fn(async () => answer("Happy to help."));
    await askAssistant(event, { message: "make it 400", history: [{ role: "user", text: "add guests" }] }, { eventId: event.id, today: TODAY }, { structured });
    const prompt = JSON.stringify(structured.mock.calls[0]);
    expect(prompt).toContain("Family: add guests");
    expect(prompt).toContain("Latest message: make it 400");
    expect(prompt).toContain("not instructions to you");
  });

  it("turns a message into a stable fixture name", () => {
    expect(messageSlug("What should we book first?")).toBe("what-should-we-book-first");
  });
});

describe("POST /api/events/:id/assistant", () => {
  const reply = async (id: string, message: string) => (await post(id, { message })).json() as Promise<{ reply: string; action: { type: string; label?: string; href?: string } | null }>;

  it("proposes a change and leaves the plan alone", async () => {
    const response = await reply(event.id, "Mom wants 100 more guests");
    expect(response.action).toMatchObject({ type: "change", label: "Guests: 250 → 350" });
  });

  it("answers from the plan's real numbers", async () => {
    expect((await reply(event.id, "How much budget is left?")).reply).toMatch(/₹[\d,]+ left/);
    expect((await reply(event.id, "What should we book first?")).reply).toMatch(/\(by \d+ \w+ \d{4}\)/);
  });

  it("points to the right tool", async () => {
    expect((await reply(event.id, "The family disagrees on the guest list")).action).toMatchObject({ type: "open", href: `/events/${event.id}/council` });
  });

  it("answers the suggested questions without the AI, even outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await post(event.id, { message: "How much budget is left?" });
    expect(res.status).toBe(200);
    expect((await post(event.id, { message: "Something typed freely" })).status).toBe(502);
  });

  it("explains that demo mode only knows the suggestions", async () => {
    const res = await post(event.id, { message: "Something else entirely" });
    expect(res.status).toBe(422);
  });

  it("has saved wording for every suggestion", async () => {
    for (const message of ASSISTANT_SUGGESTIONS) expect((await post(event.id, { message })).status).toBe(200);
  });

  it("rejects bad requests and unknown events", async () => {
    expect((await post(event.id, { message: "" })).status).toBe(400);
    expect((await post("00000000-0000-0000-0000-000000000000", { message: "How much budget is left?" })).status).toBe(404);
  });
});
