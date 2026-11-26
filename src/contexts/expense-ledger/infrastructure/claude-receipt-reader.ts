import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ReceiptReader } from "../application/ports";
import { CATEGORIES } from "../domain/expense";
import type { ReceiptImage, ReceiptReading } from "../domain/receipt";

const Reading = z.object({
  is_receipt: z.boolean().describe("false if the photo is not a receipt, invoice or bill"),
  total: z
    .string()
    .nullable()
    .describe(
      "The final amount paid, including taxes and any tip (propina) that is part of the total to pay. " +
        "Plain decimal: digits, optional '.' and decimals, no thousands separators or symbols. " +
        "Colombian receipts write thousands with dots: '$184.000' is '184000'.",
    ),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. COP, USD, EUR. Null if it can't be told."),
  merchant: z.string().nullable().describe("Business name as a person would say it, e.g. 'Crepes & Waffles'."),
  date: z.string().nullable().describe("Purchase date as YYYY-MM-DD, or null."),
  category: z.enum(CATEGORIES).nullable().describe(
    "comida (restaurants, cafés), transporte (taxi, fuel, tolls, flights), super (supermarket), " +
      "tragos (bars, liquor), alojamiento (hotel, Airbnb), planes (tours, tickets, activities), otro.",
  ),
});

const SYSTEM =
  "You read photos of receipts and invoices for a group-trip expense app used mostly in Colombia " +
  "and Latin America. Extract only what is printed on the receipt; use null for anything you can't read. " +
  "When there are several totals (subtotal, propina sugerida, total a pagar), return the amount actually " +
  "charged. Never invent a merchant or date.";

/** ReceiptReader backed by Claude's vision. Configure with ANTHROPIC_API_KEY. */
export class ClaudeReceiptReader implements ReceiptReader {
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async read(image: ReceiptImage, hint: { baseCurrency: string }): Promise<ReceiptReading | null> {
    const response = await this.client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Re-runs on a fallback model if the request is declined, inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Reading) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: Buffer.from(image.bytes).toString("base64") },
            },
            { type: "text", text: `The trip's currency is ${hint.baseCurrency}. Read this receipt.` },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return null;
    const r = response.parsed_output;
    return { isReceipt: r.is_receipt, total: r.total, currency: r.currency, merchant: r.merchant, date: r.date, category: r.category };
  }
}
