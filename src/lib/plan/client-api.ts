/** Browser-side JSON calls to Utsav's API, with friendly errors. */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

function errorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const err = body.error;
  return typeof err === "object" && err !== null && "message" in err && typeof err.message === "string" ? err.message : null;
}

export async function apiCall<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, message: errorMessage(body) ?? "Couldn't update the plan — try again." };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, message: "Couldn't reach Utsav — check your connection and try again." };
  }
}
