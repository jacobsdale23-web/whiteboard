import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BID_CATEGORIES } from "./estimate";

const PlanReviewSchema = z.object({
  summary: z.string().describe("2-3 sentence overview of the bid package and what stood out"),
  findings: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      category: z.string().describe("short label, e.g. 'Non-standard material', 'Site condition', 'Missing scope'"),
      title: z.string(),
      description: z.string().describe("what it is, where it's referenced (sheet/section), and why it could be missed or underpriced"),
      suggestedBidCategory: z.enum(BID_CATEGORIES as [string, ...string[]]).nullable(),
    })
  ),
});

export type PlanReviewResult = z.infer<typeof PlanReviewSchema>;

const REVIEW_PROMPT = `You are reviewing construction plans and specifications for Feliciana Welders, a natural gas pipeline contractor, who is preparing a competitive bid. Their crews perform: heavy equipment operation, excavation & trenching, directional boring, steel pipe welding, plastic (PE) pipe fusion, and general pipeline labor.

Read the attached plans/specs and flag anything an estimator could easily miss or underprice, especially:
- Non-standard materials, fittings, or specs that cost more than typical for this kind of work
- Unusual site conditions (traffic control, environmental/wetland permitting, confined space, high-pressure tie-ins, contaminated soil, rock excavation, etc.)
- Scope that isn't obviously covered by a standard bid item (bonding, special testing, after-hours work, utility conflicts, restoration requirements)
- Anything ambiguous or missing that should be clarified with the client before bidding

For each finding, note which bid category it most likely affects, or null if none fit well. Only flag things genuinely worth a second look — don't pad the list with routine scope every pipeline bid already expects.`;

// Sends ONE plan/spec PDF to Claude and returns a structured list of
// flagged items. Costs real API usage each call — the caller should gate
// this behind an explicit user action, not run it automatically.
//
// This reviews exactly one file per call, invoked from its own server
// action round trip, so each file gets its own ~5 minute Vercel execution
// window. Bundling multiple large scanned volumes into a single
// request/invocation risked both Anthropic's own PDF-processing limits
// and Vercel's function timeout (a 2-volume, 54mb review hit the 300s
// timeout even after fixing the request-size and PDF-processing errors).
// The file goes through the Files API (500mb/file, no request-size
// constraint) instead of being inlined as base64, and is deleted again
// once the review call finishes.
export async function reviewSinglePlanDocument(file: { filename: string; buffer: Buffer }): Promise<PlanReviewResult> {
  const client = new Anthropic();
  const uploaded = await client.files.upload({ file: await toFile(file.buffer, file.filename, { type: "application/pdf" }) });

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: uploaded.id }, title: file.filename },
            { type: "text", text: REVIEW_PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(PlanReviewSchema) },
    });

    if (!response.parsed_output) throw new Error("Couldn't parse the AI review response.");
    return response.parsed_output;
  } finally {
    await client.files.delete(uploaded.id).catch(() => {});
  }
}
