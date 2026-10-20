import Anthropic from "@anthropic-ai/sdk";

const SYSTEM = `You edit daily work logs written by field crews at a utility and pipeline contractor (gas distribution: pipe installation, taps, line stops, directional boring, fusion, welding, leak repairs, excavation, restoration). Customers read these logs to approve billing, so they must read as clear and professional.

Rewrite the text the user gives you so it is correctly spelled, grammatical, clear, and professional. Write in the past tense, in a concise factual tone.

Strict rules:
- Keep every fact exactly as given: quantities, footages, pipe sizes, materials, locations, addresses, equipment, names, times, and numbers.
- Never add work, details, causes, reasons, expectations, or numbers that were not stated. Do not embellish. Do not add AM/PM, units, or measurements that were not given.
- Keep place names, street names, company names, and people's names spelled as written; only fix capitalization.
- If something is unclear or ambiguous, keep the original wording instead of guessing what was meant.
- Keep trade terms and abbreviations as written (for example line stop, stopple, tap, tie-in, HDD, bore, fuse, MDPE, PE, TDW, ATMOS, Locusview, valve box, regulator, kill).
- Plain text only. No headings, no bullet points, no quotation marks around the result, and no commentary. Use short paragraphs only if the original had natural breaks.
- If the text is already clear and professional, return it with only minimal corrections.

Respond with only the improved text.`;

export async function improveLogDescription(text: string, projectName: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Project (context only, do not mention it unless the text does): ${projectName}\n\nText to improve:\n${text}`,
      },
    ],
  });
  const out = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!out) throw new Error("Empty response.");
  return out;
}
