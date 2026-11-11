// Troubleshooting trail for QuickBooks calls. Intuit returns an `intuit_tid` reference on every response; quoting it lets
// Intuit support find the exact call. Each call writes one JSON line to the server log (Vercel keeps these): which call, the
// result, and Intuit's reference. Never tokens and never request bodies or query text that White Board sends. Intuit's own
// error message is kept on failures because support needs it, and it can repeat a small piece of the request.

export type QbCall = { op: string; method: string; path: string; status: number; tid: string | null; fault?: string };

type HeadersLike = { headers: { get(name: string): string | null } };

// Header names are case-insensitive, so one lookup covers intuit_tid / Intuit_Tid.
export const intuitTid = (res: HeadersLike): string | null => (res.headers.get("intuit_tid") || "").trim().slice(0, 100) || null;

// The call's address without the query string (queries carry customer names), and with numeric ids kept: they help support.
export const pathForLog = (path: string): string => path.split("?")[0].slice(0, 120);

// " (Intuit ref: abc)" for the end of an error message people can quote to support.
export const refNote = (tid: string | null): string => (tid ? ` (Intuit ref: ${tid})` : "");

export function qbLogLine(c: QbCall): string {
  return JSON.stringify({ qb: c.status >= 400 ? "error" : "call", op: c.op, method: c.method, path: pathForLog(c.path), status: c.status, intuit_tid: c.tid, ...(c.fault ? { fault: c.fault.slice(0, 300) } : {}) });
}

export function logQbCall(c: QbCall, sink: Pick<Console, "log" | "error"> = console): void {
  (c.status >= 400 ? sink.error : sink.log)(qbLogLine(c));
}
