/**
 * Creates the demo event on a running server and prints its link.
 * Events live in the server's memory for now, so a script can't write them directly; once the
 * Drizzle repository exists this should seed the database instead.
 * Run with: pnpm db:seed (and `pnpm dev` running). UTSAV_URL overrides http://localhost:3000.
 */
const base = process.env.UTSAV_URL ?? "http://localhost:3000";

async function main() {
  const res = await fetch(`${base}/api/demo`, { method: "POST" }).catch(() => null);
  if (!res) throw new Error(`No server at ${base}. Start it with "pnpm dev" first.`);
  if (!res.ok) throw new Error(`Seeding failed (${res.status}): ${await res.text()}`);
  const { event } = (await res.json()) as { event: { id: string; title: string } };
  console.log(`Created "${event.title}": ${base}/events/${event.id}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
