import { redirect } from "next/navigation";

// The schedule now lives on the Calendar (hover a job to see who is going; click it to schedule people).
export default function SchedulePage() {
  redirect("/calendar");
}
