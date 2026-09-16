import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
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

// Splits a PDF into ~pagesPerChunk-page pieces so a large multi-page bid
// schedule (e.g. a term contract with a rate for every category, running
// well past 100 pages) can be extracted chunk-by-chunk instead of in one
// oversized request. Pure-JS (pdf-lib), no native binaries -- safe on
// Vercel. A short document just comes back as a single "chunk".
export async function splitPdfIntoChunks(buffer: Buffer, pagesPerChunk: number): Promise<Buffer[]> {
  const source = await PDFDocument.load(buffer);
  const totalPages = source.getPageCount();
  const chunks: Buffer[] = [];

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await chunkDoc.copyPages(source, pageIndices);
    for (const page of copiedPages) chunkDoc.addPage(page);
    chunks.push(Buffer.from(await chunkDoc.save()));
  }

  return chunks;
}

// Costs real API usage per call — the caller should gate this behind an
// explicit user action, not run it automatically.
//
// Handles one chunk (or a whole small form) at a time via the Files API,
// same pattern as lib/plan-review.ts — avoids the Messages API's 32mb
// inline request-size limit and keeps each call's Vercel execution
// window scoped to a single chunk instead of a whole multi-hundred-page
// document.
export async function extractBidItemsFromPdf(file: { filename: string; buffer: Buffer }): Promise<BidImportResult> {
  const client = new Anthropic();
  const uploaded = await client.files.upload({ file: await toFile(file.buffer, file.filename, { type: "application/pdf" }) });

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: uploaded.id }, title: file.filename },
            { type: "text", text: IMPORT_PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(BidImportSchema) },
    });

    if (!response.parsed_output) throw new Error("Couldn't parse the extraction response.");
    return response.parsed_output;
  } finally {
    await client.files.delete(uploaded.id).catch(() => {});
  }
}
