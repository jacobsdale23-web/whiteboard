import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const QuoteSchema = z.object({
  number: z.string().nullable().describe("the estimate/quote number as printed (digits only if it is labelled like 'Estimate no.: 1646'); null if not shown"),
  date: z.string().nullable().describe("the estimate date as YYYY-MM-DD; null if not shown"),
  expires: z.string().nullable().describe("the expiration date as YYYY-MM-DD; null if not shown"),
  customer: z.string().nullable().describe("the customer the estimate is addressed to; null if not shown"),
  total: z.number().nullable().describe("the grand total of the estimate in dollars; null if not shown"),
  lines: z
    .array(
      z.object({
        description: z.string().describe("the scope line's description exactly as written"),
        qty: z.number().describe("the quantity on that line; 1 if the line shows none"),
        amount: z.number().describe("that line's amount in dollars"),
      })
    )
    .describe("the scope lines of the estimate, in order, without subtotal or total rows"),
});

export type ScannedQuote = z.infer<typeof QuoteSchema>;

const PROMPT = `This is an estimate (a quote) for a small utility/pipeline construction job, printed from QuickBooks.

Return the estimate number, its date and expiration date as YYYY-MM-DD, the customer, the grand total, and every scope line (description, quantity, amount).

CRITICAL: Copy descriptions and amounts exactly as printed. Never estimate or invent a value; if something is not shown, return null for it. The scope lines are used later to confirm what was quoted versus what was built, and the total is used for billing.`;

export async function scanQuotePdf(buffer: Buffer): Promise<ScannedQuote> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(QuoteSchema) },
  });
  if (!response.parsed_output) throw new Error("Couldn't read the quote.");
  return response.parsed_output;
}
