import "server-only";
import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { formatClock, formatDate, formatINR } from "@/lib/format";
import { buildBudgetView } from "@/lib/plan/budget-view";
import { ritualGroups, tasksByMonth } from "@/lib/plan/timeline-view";
import type { StoredEvent } from "@/lib/plan/types";

/** The family's printable copy of the plan (CLAUDE.md F10). */

const MAROON = "#7F1D1D";
const MARIGOLD = "#F59E0B";
const INK = "#1F2937";
const MUTED = "#4B5563";
const LINE = "#E5E0D5";

// The built-in PDF fonts have no ₹. Noto Sans has it in the latin-ext subset, so latin text falls
// through to that family only for the characters it lacks.
const fontFile = (subset: string, weight: number) =>
  path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", `noto-sans-${subset}-${weight}-normal.woff`);

for (const [family, subset] of [["NotoLatin", "latin"], ["NotoExt", "latin-ext"]] as const) {
  Font.register({ family, fonts: [{ src: fontFile(subset, 400), fontWeight: 400 }, { src: fontFile(subset, 700), fontWeight: 700 }] });
}
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { fontFamily: ["NotoLatin", "NotoExt"], fontSize: 10, color: INK, paddingHorizontal: 40, paddingTop: 40, paddingBottom: 56, lineHeight: 1.4 },
  brand: { fontSize: 10, fontWeight: 700, color: "#92400E", letterSpacing: 2 },
  title: { fontSize: 24, fontWeight: 700, color: MAROON, marginTop: 4, lineHeight: 1.3 },
  facts: { color: MUTED, marginTop: 4 },
  rule: { height: 2, backgroundColor: MARIGOLD, marginTop: 10 },
  h2: { fontSize: 14, fontWeight: 700, color: MAROON, marginTop: 20, marginBottom: 6 },
  h3: { fontSize: 11, fontWeight: 700, color: MAROON, marginTop: 10, marginBottom: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  rowText: { flex: 1 },
  strong: { fontWeight: 700 },
  muted: { color: MUTED },
  note: { color: MUTED, fontSize: 9, marginTop: 6 },
  check: { flexDirection: "row", gap: 6, paddingVertical: 1.5 },
  box: { width: 9, height: 9, borderWidth: 0.75, borderColor: MUTED, marginTop: 2 },
  boxDone: { backgroundColor: MAROON, borderColor: MAROON },
  footer: { position: "absolute", left: 40, right: 40, bottom: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED },
});

function Check({ done = false, children }: { done?: boolean; children: ReactNode }) {
  return (
    <View style={styles.check} wrap={false}>
      <View style={done ? [styles.box, styles.boxDone] : styles.box} />
      <Text style={styles.rowText}>{children}</Text>
    </View>
  );
}

function Schedule({ event }: { event: StoredEvent }) {
  return (
    <View>
      <Text style={styles.h2}>Schedule</Text>
      {event.plan.functions.map((f) => (
        <View key={f.name} style={styles.row} wrap={false}>
          <Text style={styles.rowText}>
            <Text style={styles.strong}>{f.name}</Text>
            {`\n${formatDate(f.date, { weekday: true })}, ${formatClock(f.startTime)} – ${formatClock(f.endTime)}`}
          </Text>
          <Text>{f.expectedGuests.toLocaleString("en-IN")} guests</Text>
        </View>
      ))}
    </View>
  );
}

function Budget({ event }: { event: StoredEvent }) {
  const view = buildBudgetView(event);
  return (
    <View>
      <Text style={styles.h2}>Budget</Text>
      {view.rows
        .filter((r) => r.estimatePaise > 0)
        .map((r) => (
          <View key={r.category} style={styles.row} wrap={false}>
            <Text style={styles.rowText}>{r.label}</Text>
            <Text>{formatINR(r.estimatePaise)}</Text>
          </View>
        ))}
      <View style={styles.row} wrap={false}>
        <Text style={[styles.rowText, styles.strong]}>Estimated total</Text>
        <Text style={styles.strong}>{formatINR(view.totalEstimatePaise)}</Text>
      </View>
      {!view.isEstimate && (
        <View style={styles.row} wrap={false}>
          <Text style={styles.rowText}>{view.overBudgetPaise > 0 ? `Over your ${formatINR(view.budgetTotalPaise)} budget by` : `Left from your ${formatINR(view.budgetTotalPaise)} budget`}</Text>
          <Text>{formatINR(view.overBudgetPaise > 0 ? view.overBudgetPaise : view.remainingPaise)}</Text>
        </View>
      )}
      <Text style={styles.note}>Prices are indicative estimates, not vendor quotes.</Text>
    </View>
  );
}

function Rituals({ event }: { event: StoredEvent }) {
  return (
    <View break>
      <Text style={styles.h2}>Rituals and what to arrange</Text>
      {event.rituals.confidence === "low" && <Text style={styles.note}>General suggestion — verify with your family priest or elders.</Text>}
      {ritualGroups(event, []).map((group) => (
        <View key={group.functionName ?? "unplaced"}>
          <Text style={styles.h3}>{group.functionName ?? "Not yet scheduled"}</Text>
          {group.rituals.map((r) => (
            <View key={r.key}>
              <Text style={styles.strong} minPresenceAhead={24}>
                {r.name} <Text style={styles.muted}>· {r.durationMinutes} min</Text>
              </Text>
              {r.items.map((it) => (
                <Check key={it.id} done={it.procured}>
                  {it.item}
                  {it.quantity ? ` (${it.quantity})` : ""}
                </Check>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Tasks({ event }: { event: StoredEvent }) {
  return (
    <View break>
      <Text style={styles.h2}>Task checklist</Text>
      {tasksByMonth(event.timeline.tasks).map((group) => (
        <View key={group.month}>
          <Text style={styles.h3} minPresenceAhead={24}>
            {group.month}
          </Text>
          {group.tasks.map((t) => (
            <Check key={t.ref}>
              {t.title} <Text style={styles.muted}>· by {formatDate(t.dueDate)}</Text>
            </Check>
          ))}
        </View>
      ))}
    </View>
  );
}

function PlanDocument({ event }: { event: StoredEvent }) {
  const { plan, answers } = event;
  const dates = plan.endDate === plan.startDate ? formatDate(plan.startDate) : `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`;
  return (
    <Document title={event.title} author="Utsav">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>UTSAV</Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.facts}>
          {dates} · {answers.city} · {answers.guestCount.toLocaleString("en-IN")} guests
        </Text>
        <View style={styles.rule} />
        <Schedule event={event} />
        <Budget event={event} />
        <Rituals event={event} />
        <Tasks event={event} />
        <View style={styles.footer} fixed>
          <Text>{event.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function eventToPDF(event: StoredEvent): Promise<Buffer> {
  return renderToBuffer(<PlanDocument event={event} />);
}
