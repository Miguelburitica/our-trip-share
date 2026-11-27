import { describe, expect, it } from "vitest";
import { flushPending, type PendingExpense, type PendingStore, type SyncApi } from "./sync";

const memory = (items: PendingExpense[]): PendingStore & { items: Map<string, PendingExpense> } => {
  const map = new Map(items.map((i) => [i.id, i]));
  return { items: map, list: async () => [...map.values()], put: async (i) => void map.set(i.id, i), remove: async (id) => void map.delete(id) };
};
const item = (id: string, at: string, extra: Partial<PendingExpense> = {}): PendingExpense => ({
  id,
  tripId: "t1",
  createdAt: at,
  input: { amount: 18_000, currency: "COP", cardCharge: null, category: "transporte", payerSeatId: "leo", participantIds: ["a", "b"] },
  label: "Peaje",
  status: "waiting",
  ...extra,
});
const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

describe("Offline expenses reaching the server", () => {
  it("sends them oldest first, uploading the photo before the expense, and clears them", async () => {
    const store = memory([item("b", "2026-11-24T10:05:00Z"), item("a", "2026-11-24T10:00:00Z", { photo })]);
    const calls: string[] = [];
    const api: SyncApi = {
      upload: async () => (calls.push("upload a"), { ok: true, receiptPath: "t1/x.webp" }),
      record: async (i) => (calls.push(`record ${i.id} ${i.receiptPath ?? "-"}`), { ok: true }),
    };
    expect(await flushPending(store, api)).toEqual({ sent: 2, failed: 0, offline: false });
    expect(calls).toEqual(["upload a", "record a t1/x.webp", "record b -"]);
    expect(store.items.size).toBe(0);
  });

  it("stops when the connection drops and never uploads the same photo twice", async () => {
    const store = memory([item("a", "2026-11-24T10:00:00Z", { photo })]);
    let uploads = 0;
    let online = false;
    const api: SyncApi = {
      upload: async () => (uploads++, { ok: true, receiptPath: "t1/x.webp" }),
      record: async () => {
        if (!online) throw new TypeError("Failed to fetch");
        return { ok: true };
      },
    };
    expect(await flushPending(store, api)).toEqual({ sent: 0, failed: 0, offline: true });
    expect(store.items.get("a")).toMatchObject({ receiptPath: "t1/x.webp", photo: null, status: "waiting" });
    online = true;
    expect(await flushPending(store, api)).toMatchObject({ sent: 1 });
    expect(uploads).toBe(1);
  });

  it("keeps what the server rejects, with its reason, and doesn't retry it", async () => {
    const store = memory([item("a", "2026-11-24T10:00:00Z")]);
    let calls = 0;
    const api: SyncApi = { upload: async () => ({ ok: true, receiptPath: "" }), record: async () => (calls++, { ok: false, message: "El viaje está cerrado" }) };
    expect(await flushPending(store, api)).toEqual({ sent: 0, failed: 1, offline: false });
    expect(store.items.get("a")).toMatchObject({ status: "failed", error: "El viaje está cerrado" });
    await flushPending(store, api);
    expect(calls).toBe(1);
  });
});
