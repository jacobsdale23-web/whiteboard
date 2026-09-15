import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BID_CATEGORIES } from "./estimate";

const ExtractedItemSchema = z.object({
  itemNo: z.string().describe("the reference/item number exactly as written in the source document; if none is given, assign sequential numbers starting at 1"),
  description: z.string().describe("the full line item description, transcribed as written"),
  qty: z.number().describe("the quantity exactly as stated in the document — never estimate or invent a number that isn't explicitly given"),
  unit: z.string().describe("the unit of measure exactly as written (e.g. LNFT, EACH, LUMP SUM, CY, TON)"),
  category: z
    .enum(BID_CATEGORIES as [string, ...string[]])
    .nullable()
    .describe("closest matching bid category for this line item, or null if none fit well"),
});

const BidImportSchema = z.object({
  items: z.array(ExtractedItemSchema),
  notes: z.string().describe("anything ambiguous, illegible, or that needed judgment while transcribing — empty string if none"),
});

export type BidImportResult = z.infer<typeof BidImportSchema>;

const IMPORT_PROMPT = `You are transcribing a unit-price bid schedule (a "Schedule of Values" or "Unit Price Form", often a Louisiana Uniform Public Work Bid Form or similar owner-provided bid schedule) for a natural gas pipeline contractor preparing a bid.

Extract every line item exactly as it appears: the reference/item number, the full description, the quantity, and the unit of measure. These are usually laid out in a repeating table structure with fields like "REF. NO.", "DESCRIPTION", "QUANTITY", and "UNIT OF MEASURE".

CRITICAL: Transcribe quantities and reference numbers EXACTLY as written. Never estimate, round, or invent a number that isn't explicitly stated in the document — these are used for real bid pricing. If a field is genuinely blank or illegible, note it in "notes" rather than guessing at a value. Do NOT extract unit price or extension columns — those are intentionally left blank in the source for the bidder to fill in, and this tool computes them separately.

For each item, suggest the closest matching bid category from this list, or null if none fit well: ${BID_CATEGORIES.join(", ")}.`;

// Costs real API usage per call — the caller should gate this behind an
// explicit user action, not run it automatically.
export async function extractBidItemsFromPdf(files: { filename: string; buffer: Buffer }[]): Promise<BidImportResult> {
  const client = new Anthropic();

  const content: Anthropic.Messages.ContentBlockParam[] = files.map((f) => ({
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data: f.buffer.toString("base64") },
    title: f.filename,
  }));
  content.push({ type: "text", text: IMPORT_PROMPT });

  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 8000,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(BidImportSchema) },
  });

  if (!response.parsed_output) throw new Error("Couldn't parse the extraction response.");
  return response.parsed_output;
}
