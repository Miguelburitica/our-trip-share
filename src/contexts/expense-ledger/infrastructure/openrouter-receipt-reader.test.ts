import { describe, expect, it } from "vitest";
import { DEFAULT_RECEIPT_MODEL, OPENROUTER_URL, OpenRouterReceiptReader, parseReading } from "./openrouter-receipt-reader";

const photo = { bytes: new Uint8Array([0xff, 0xd8]), mediaType: "image/jpeg" as const };
const answer = { is_receipt: true, total: "96000", currency: "COP", merchant: "Bar Bajo", date: "2026-11-21", category: "tragos" };
const reply = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } });

describe("OpenRouter receipt reader", () => {
  it("sends the photo as an image_url with the JSON schema and reads the answer", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const reader = new OpenRouterReceiptReader({
      apiKey: "test-key",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return reply(JSON.stringify(answer));
      },
    });
    expect(await reader.read(photo, { baseCurrency: "COP" })).toEqual({
      isReceipt: true,
      total: "96000",
      currency: "COP",
      merchant: "Bar Bajo",
      date: "2026-11-21",
      category: "tragos",
    });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe(OPENROUTER_URL);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(body.model).toBe(DEFAULT_RECEIPT_MODEL);
    expect(body.response_format.json_schema.schema.required).toContain("total");
    expect(body.messages[1].content[1].image_url.url).toBe("data:image/jpeg;base64,/9g=");
  });

  it("returns null on HTTP errors, network errors and answers that don't fit", async () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      const with_ = (f: () => Promise<Response>) => new OpenRouterReceiptReader({ apiKey: "k", fetch: f }).read(photo, { baseCurrency: "COP" });
      expect(await with_(async () => reply("", 429))).toBeNull();
      expect(await with_(async () => Promise.reject(new Error("offline")))).toBeNull();
      expect(await with_(async () => reply("no sé"))).toBeNull();
    } finally {
      console.error = quiet;
    }
  });

  it("parses JSON wrapped in prose or code fences and rejects unknown categories", () => {
    expect(parseReading("```json\n" + JSON.stringify(answer) + "\n```")?.merchant).toBe("Bar Bajo");
    expect(parseReading(JSON.stringify({ ...answer, category: "casino" }))).toBeNull();
    expect(parseReading(42)).toBeNull();
  });
});
