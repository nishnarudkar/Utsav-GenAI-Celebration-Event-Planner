import Link from "next/link";

export default function EventNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 px-4 py-6">
      <h1 className="font-display text-3xl text-maroon">We couldn&apos;t find that plan</h1>
      <p className="text-muted">
        Plans are kept in memory for now, so they disappear when the server restarts. Start a new one — it only takes six questions.
      </p>
      <Link href="/new" className="rounded-full bg-maroon px-6 py-3 font-medium text-cream hover:bg-maroon-dark">
        Plan a celebration
      </Link>
    </main>
  );
}
