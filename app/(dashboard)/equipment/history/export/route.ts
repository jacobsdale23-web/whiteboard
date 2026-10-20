import { getSessionAndProfile } from "@/lib/auth/current-user";
import { loadEquipmentHistory, formatDowntime } from "@/lib/equipment-history";

function csv(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const current = await getSessionAndProfile();
  if (!current || current.profile.role !== "admin") return new Response("Admins only.", { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const status = url.searchParams.get("status") || "";
  const rows = (await loadEquipmentHistory()).filter(
    (r) =>
      (!status || r.status === status) &&
      (!q || [r.equipment, r.project, r.reportedBy, r.resolvedBy || "", r.problem, r.resolution || ""].some((s) => s.toLowerCase().includes(q)))
  );

  const header = ["Reported", "Reported by", "Equipment", "Project", "Severity", "Problem", "Possible cause", "Status", "Fixed (Central)", "Fixed by", "Downtime", "What was done", "Parts cost"];
  const lines = [header.map(csv).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.reportedDate,
        r.reportedBy,
        r.equipment,
        r.project,
        r.urgency,
        r.problem,
        r.suspectedCause,
        r.status,
        r.resolvedAt ? r.resolvedAt.toLocaleString("en-US", { timeZone: "America/Chicago" }) : "",
        r.resolvedBy,
        formatDowntime(r.hoursDown),
        r.resolution,
        r.partsCost ? r.partsCost.toFixed(2) : "",
      ]
        .map(csv)
        .join(",")
    );
  }
  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="equipment-repair-log-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
