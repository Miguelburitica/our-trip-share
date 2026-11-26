import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseExpenseRepository } from "@/contexts/expense-ledger/infrastructure/supabase-expense-repository";
import type { Database } from "@/platform/supabase/database.types";
import type { Db } from "@/platform/supabase/db";
import { PrincipalId, type ExpenseId, type SeatId, type TripId } from "@/shared-kernel/ids";
import { createSupabaseContainer } from "./container";

/**
 * The Supabase adapters against the local stack: same use cases as the in-memory tests, but every
 * write goes through save_trip / save_expense and every read through PostgREST.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI provides the variables directly.
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

describe.skipIf(!url || !secret)("Supabase repositories (local stack)", () => {
  const db: Db = createClient<Database>(url!, secret!, { auth: { persistSession: false } });
  const c = createSupabaseContainer(db);
  const run = Math.random().toString(36).slice(2, 8);
  const users: string[] = [];
  let mateo: { id: PrincipalId; kind: "user" };
  let tripId: TripId;
  const seats = new Map<string, SeatId>();

  const newUser = async (name: string) => {
    const { data, error } = await db.auth.admin.createUser({ email: `${name}-${run}@test.local`, email_confirm: true });
    if (error) throw error;
    users.push(data.user.id);
    return PrincipalId(data.user.id);
  };

  beforeAll(async () => {
    mateo = { id: await newUser("mateo"), kind: "user" };
    const trip = await c.membership.createTrip({
      principal: mateo,
      displayName: "Mateo",
      name: `Cartagena ${run}`,
      baseCurrency: "COP",
      people: ["Ana", "Juli"],
    });
    if (!trip.ok) throw trip.error;
    tripId = trip.value.id;
    for (const s of trip.value.seats) seats.set(s.displayName, s.id);
  });

  afterAll(async () => {
    if (tripId) await db.from("trips").delete().eq("id", tripId);
    for (const id of users) await db.auth.admin.deleteUser(id);
  });

  it("round-trips the trip aggregate with seat order and version", async () => {
    const trip = await c.membership.getTrip(mateo.id, tripId);
    expect(trip.ok && trip.value.seats.map((s) => [s.displayName, s.role, s.linkKind])).toEqual([
      ["Mateo", "owner", "user"],
      ["Ana", "member", "none"],
      ["Juli", "member", "none"],
    ]);
    const { data } = await db.from("trips").select("version").eq("id", tripId).single();
    expect(data?.version).toBe(0);
  });

  it("lets exactly one of two people claim the same personal link at once", async () => {
    const invite = await c.membership.issueInvite(mateo.id, tripId, seats.get("Juli")!);
    if (!invite.ok) throw invite.error;
    const [a, b] = [await newUser("juli-a"), await newUser("juli-b")];
    // Separate containers: each request loads its own copy of the trip, as two phones would.
    const [ra, rb] = await Promise.all([
      createSupabaseContainer(db).membership.claimWithInvite(tripId, invite.value.token, { id: a, kind: "guest" }),
      createSupabaseContainer(db).membership.claimWithInvite(tripId, invite.value.token, { id: b, kind: "guest" }),
    ]);
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1);
    const loser = ra.ok ? rb : ra;
    expect(!loser.ok && loser.error.code).toBe("already_claimed");
  });

  it("stores expenses exactly: allocation, row order, decimal FX rate, history", async () => {
    const equal = await c.ledger.recordExpense(mateo.id, tripId, { currency: "COP", amount: 100_000, category: "comida" });
    if (!equal.ok) throw equal.error;
    expect(equal.value.expense.shares.map((s) => s.amount).sort()).toEqual([33_333, 33_333, 33_334]);

    const usd = await c.ledger.recordExpense(mateo.id, tripId, {
      currency: "USD",
      amount: 12_050,
      fx: { kind: "rate", rate: "4123.5", source: "manual" },
      split: { method: "exact", shares: [{ seatId: seats.get("Juli")!, amount: 2_050 }, { seatId: seats.get("Mateo")!, amount: 10_000 }] },
    });
    if (!usd.ok) throw usd.error;

    const stored = await new SupabaseExpenseRepository(db).get(usd.value.expense.id as ExpenseId);
    const money = stored!.toPrimitives().money!;
    expect(money.fxRate).toBe("4123.5");
    expect(money.baseAmount).toBe(Math.round(12_050 * 4123.5 / 100));
    expect(money.shares.map((s) => s.seatId)).toEqual([seats.get("Juli"), seats.get("Mateo")]);
    expect(stored!.toPrimitives().history.map((h) => h.kind)).toEqual(["created"]);
  });

  it("rejects a stale money edit with a conflict from save_expense", async () => {
    const created = await c.ledger.recordExpense(mateo.id, tripId, { currency: "COP", amount: 60_000 });
    if (!created.ok) throw created.error;
    const id = created.value.expense.id;
    const a = await c.ledger.editExpenseMoney(mateo.id, tripId, id, 1, { currency: "COP", amount: 66_000 });
    const b = await c.ledger.editExpenseMoney(mateo.id, tripId, id, 1, { currency: "COP", amount: 70_000 });
    expect(a.ok).toBe(true);
    expect(!b.ok && b.error.code).toBe("conflict");
    const history = await new SupabaseExpenseRepository(db).get(id);
    expect(history!.toPrimitives().history.map((h) => h.kind)).toEqual(["created", "money_changed"]);
  });

  it("derives balances from stored rows and confirms a payment", async () => {
    const before = await c.settlement.getTripBalances(mateo.id, tripId);
    if (!before.ok) throw before.error;
    expect(before.value.balances.reduce((sum, b) => sum + b.balance, 0)).toBe(0);

    const juli = before.value.balances.find((b) => b.seatId === seats.get("Juli"))!;
    const anaOwes = -before.value.balances.find((b) => b.seatId === seats.get("Ana"))!.balance;
    // Mateo records what Ana paid him: the receiver recording it confirms it at once.
    const paid = await c.settlement.recordSettlement(mateo.id, tripId, {
      from: seats.get("Ana")!,
      to: seats.get("Mateo")!,
      amount: anaOwes,
      method: "nequi",
    });
    expect(paid.ok && paid.value.status).toBe("confirmed");

    const after = await c.settlement.getTripBalances(mateo.id, tripId);
    if (!after.ok) throw after.error;
    expect(after.value.balances.find((b) => b.seatId === seats.get("Ana"))!.balance).toBe(0);
    expect(after.value.balances.find((b) => b.seatId === seats.get("Juli"))!.balance).toBe(juli.balance);
  });

  it("stores and dismisses balance notices", async () => {
    const before = (await db.from("settlements").select("id", { count: "exact", head: true }).eq("trip_id", tripId)).count ?? 0;
    expect(before).toBeGreaterThan(0); // Ana's confirmed settlement from the previous test
    const r = await c.ledger.recordExpense(mateo.id, tripId, {
      currency: "COP",
      amount: 20_000,
      title: "Helado",
      split: { method: "equal", participants: [seats.get("Ana")!, seats.get("Juli")!] },
    });
    if (!r.ok) throw r.error;
    const { data } = await db.from("balance_notices").select("seat_id, delta, cause_title").eq("trip_id", tripId);
    expect(data).toEqual([{ seat_id: seats.get("Ana"), delta: -10_000, cause_title: "Helado" }]);
  });

  it("stores receipt photos privately and serves them through signed URLs", async () => {
    const scan = await c.ledger.scanReceipt(mateo.id, tripId, { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg" });
    if (!scan.ok) throw scan.error;
    const saved = await c.ledger.recordExpense(mateo.id, tripId, { currency: "COP", amount: 5_000, receiptPaths: [scan.value.receiptPath] });
    if (!saved.ok) throw saved.error;
    const link = await c.ledger.receiptUrl(mateo.id, tripId, saved.value.expense.id);
    if (!link.ok) throw link.error;
    const res = await fetch(link.value);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    if (publishable) {
      const anon = createClient<Database>(url!, publishable, { auth: { persistSession: false } });
      const direct = await anon.storage.from("receipts").download(scan.value.receiptPath);
      expect(direct.error).not.toBeNull();
    }
    await db.storage.from("receipts").remove([scan.value.receiptPath]);
  });

  it("stores payout handles per seat", async () => {
    const saved = await c.settlement.setMyHandles(mateo.id, tripId, [{ kind: "nequi", value: "300 123 4567" }]);
    if (!saved.ok) throw saved.error;
    const mine = await c.settlement.getMyHandles(mateo.id, tripId);
    expect(mine.ok && mine.value).toEqual([{ kind: "nequi", value: "300 123 4567" }]);
    if (publishable) {
      const anon = createClient<Database>(url!, publishable, { auth: { persistSession: false } });
      const direct = await anon.from("payout_handles").select("*").eq("trip_id", tripId);
      expect(direct.data ?? []).toHaveLength(0);
    }
  });

  it("saves, lists and deletes split groups", async () => {
    const pair = [seats.get("Ana")!, seats.get("Juli")!];
    const saved = await c.ledger.saveSplitGroup(mateo.id, tripId, { name: "Carro 1", seatIds: pair });
    if (!saved.ok) throw saved.error;
    const dup = await c.ledger.saveSplitGroup(mateo.id, tripId, { name: " CARRO 1", seatIds: pair });
    expect(!dup.ok && dup.error.code).toBe("validation");
    const listed = await c.ledger.getQuickAddDefaults(mateo.id, tripId);
    expect(listed.ok && listed.value.groups.map((g) => [g.name, g.seatIds])).toEqual([["Carro 1", pair]]);
    expect((await c.ledger.deleteSplitGroup(mateo.id, tripId, saved.value.id)).ok).toBe(true);
    const after = await c.ledger.getQuickAddDefaults(mateo.id, tripId);
    expect(after.ok && after.value.groups).toEqual([]);
  });

  it.skipIf(!publishable)("keeps every row behind RLS for a client without a session", async () => {
    const anon = createClient<Database>(url!, publishable!, { auth: { persistSession: false } });
    const [trips, expenses] = await Promise.all([
      anon.from("trips").select("id").eq("id", tripId),
      anon.from("expenses").select("id").eq("trip_id", tripId),
    ]);
    expect(trips.data ?? []).toHaveLength(0);
    expect(expenses.data ?? []).toHaveLength(0);
    const rpc = await anon.rpc("save_trip", { p_trip: { id: tripId }, p_expected_version: 0 });
    expect(rpc.error).not.toBeNull();
  });
});
