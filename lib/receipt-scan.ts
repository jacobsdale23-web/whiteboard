import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ReceiptSchema = z.object({
  vendor: z.string().nullable().describe("the store or business name that issued the receipt, as printed; null if unreadable"),
  total: z.number().nullable().describe("the final total amount paid in dollars, including tax and tips; null if unreadable"),
  date: z.string().nullable().describe("the purchase date as YYYY-MM-DD; null if unreadable"),
});

export type ScannedReceipt = z.infer<typeof ReceiptSchema>;

const PROMPT = `Read this photo of a receipt from a purchase made for a utility/pipeline construction job (fuel, food, materials, equipment rental, etc.).

Return the vendor (the store or business name), the final total amount paid (the grand total including tax, not a subtotal, and not a single line item; if there is both a total and an amount tendered or change, use the total), and the purchase date as YYYY-MM-DD.

CRITICAL: Only report what is actually printed and legible. If the vendor, total, or date cannot be read with confidence, return null for that field rather than guessing. These amounts are used for job cost tracking.`;

export async function scanReceiptImage(buffer: Buffer, mediaType: "image/jpeg" | "image/png" | "image/webp"): Promise<ScannedReceipt> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ReceiptSchema) },
  });
  if (!response.parsed_output) throw new Error("Couldn't read the receipt.");
  return response.parsed_output;
}
