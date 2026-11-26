import { describe, expect, it } from "vitest";
import { fixedClock, DAY } from "@/shared-kernel/clock";
import { PrincipalId, sequentialIds, type SeatId } from "@/shared-kernel/ids";
import { TripMembershipUseCases } from "@/contexts/trip-membership/application/use-cases";
import type { Trip } from "@/contexts/trip-membership/domain/trip";
import { hashTokenService } from "@/contexts/trip-membership/infrastructure/hash-token-service";
import { InMemoryTripRepository } from "@/contexts/trip-membership/infrastructure/in-memory-trip-repository";
import { conflict } from "@/shared-kernel/errors";
import { FixedRateProvider } from "@/contexts/expense-ledger/infrastructure/fixed-rate-provider";
import { createMemoryContainer } from "./container";
import { DEMO_PRINCIPAL, seedCartagena } from "./demo-seed";

const setup = async () => {
  const clock = fixedClock("2026-11-22T20:00:00-05:00");
  const c = createMemoryContainer({ clock, ids: sequentialIds("id") });
  const tripId = await seedCartagena(c);
  const trip = await c.membership.getTrip(DEMO_PRINCIPAL, tripId);
  if (!trip.ok) throw trip.error;
  const seat = (name: string) => trip.value.seats.find((s) => s.displayName === name)!.id as SeatId;
  return { c, clock, tripId, seat };
};

describe("Use cases wired through the composition root", () => {
  it("reproduces the Cartagena balances and simplified plan end to end", async () => {
    const { c, tripId, seat } = await setup();
    const r = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!r.ok) throw r.error;
    expect(r.value.myBalance).toBe(1_687_000);
    expect(r.value.plan).toHaveLength(5);
    expect(r.value.plan).toContainEqual({ from: seat("Juli"), to: seat("Mateo"), amount: 641_000, pendingSettlementId: null, adjusted: false });
  });

  it("lets a guest join with a personal link and record a pending payment", async () => {
    const { c, clock, tripId, seat } = await setup();
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const juli = { id: PrincipalId("guest-juli"), kind: "guest" as const };
    const joined = await c.membership.claimWithInvite(tripId, invite.value.token, juli);
    expect(joined.ok && joined.value.mySeatId).toBe(seat("Juli"));

    const paid = await c.settlement.recordSettlement(juli.id, tripId, {
      from: seat("Juli"),
      to: seat("Mateo"),
      amount: 641_000,
      method: "breb",
    });
    expect(paid.ok && paid.value.status).toBe("pending");

    const balances = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!balances.ok) throw balances.error;
    expect(balances.value.balances.find((b) => b.seatId === seat("Juli"))!.balance).toBe(-641_000);
    expect(balances.value.plan.find((t) => t.from === seat("Juli"))!.pendingSettlementId).not.toBeNull();

    clock.advance(3 * DAY);
    const later = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!later.ok) throw later.error;
    expect(later.value.balances.find((b) => b.seatId === seat("Juli"))!.settled).toBe(true);
  });

  it("tells a settled member when a later expense changes their balance (R14)", async () => {
    const { c, tripId, seat } = await setup();
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const juli = { id: PrincipalId("guest-juli"), kind: "guest" as const };
    await c.membership.claimWithInvite(tripId, invite.value.token, juli);
    // Mateo records Juli's payment: confirmed at once.
    const paid = await c.settlement.recordSettlement(DEMO_PRINCIPAL, tripId, { from: seat("Juli"), to: seat("Mateo"), amount: 641_000, method: "breb" });
    expect(paid.ok && paid.value.status).toBe("confirmed");

    const dinner = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: 60_000,
      title: "Cena",
      split: { method: "equal", participants: [seat("Juli"), seat("Leo")] },
    });
    if (!dinner.ok) throw dinner.error;
    const notices = await c.settlement.listMyNotices(juli.id, tripId);
    if (!notices.ok) throw notices.error;
    expect(notices.value).toMatchObject([{ delta: -30_000, cause: { kind: "created", title: "Cena" }, by: seat("Mateo") }]);
    // Mateo made the change and Leo never settled: neither gets a notice.
    const mateoNotices = await c.settlement.listMyNotices(DEMO_PRINCIPAL, tripId);
    expect(mateoNotices.ok && mateoNotices.value).toEqual([]);

    const other = await c.settlement.dismissNotice(DEMO_PRINCIPAL, tripId, notices.value[0].id);
    expect(!other.ok && other.error.code).toBe("forbidden");
    expect((await c.settlement.dismissNotice(juli.id, tripId, notices.value[0].id)).ok).toBe(true);
    const after = await c.settlement.listMyNotices(juli.id, tripId);
    expect(after.ok && after.value).toEqual([]);
  });

  it("scans a receipt: stores it, pre-fills from the reader, and attaches it on save", async () => {
    const clock = fixedClock("2026-11-22T20:00:00-05:00");
    const reader = { read: async () => ({ isReceipt: true, total: "96000", currency: "COP", merchant: "Bar Bajo", date: null, category: "tragos" }) };
    const c = createMemoryContainer({ clock, ids: sequentialIds("id"), reader });
    const tripId = await seedCartagena(c);
    const photo = { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" as const };

    const scan = await c.ledger.scanReceipt(DEMO_PRINCIPAL, tripId, photo);
    if (!scan.ok) throw scan.error;
    expect(scan.value).toMatchObject({ read: true, amount: 96_000, title: "Bar Bajo", category: "tragos", note: null });
    expect(scan.value.receiptPath.startsWith(`${tripId}/`)).toBe(true);

    const saved = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: scan.value.amount!,
      title: scan.value.title,
      receiptPaths: [scan.value.receiptPath],
    });
    if (!saved.ok) throw saved.error;
    expect(saved.value.expense.receiptCount).toBe(1);
    const url = await c.ledger.receiptUrl(DEMO_PRINCIPAL, tripId, saved.value.expense.id);
    expect(url.ok && url.value).toMatch(/^data:image\/jpeg;base64,/);

    const foreign = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "COP", amount: 1000, receiptPaths: ["other-trip/x.jpg"] });
    expect(!foreign.ok && foreign.error.code).toBe("validation");
  });

  it("still attaches the photo when the reader fails or isn't configured", async () => {
    const failing = { read: async () => { throw new Error("boom"); } };
    for (const reader of [failing, null]) {
      const c = createMemoryContainer({ ids: sequentialIds("id"), reader });
      const tripId = await seedCartagena(c);
      const scan = await c.ledger.scanReceipt(DEMO_PRINCIPAL, tripId, { bytes: new Uint8Array([1]), mediaType: "image/png" });
      if (!scan.ok) throw scan.error;
      expect(scan.value).toMatchObject({ read: false, amount: null });
      expect(scan.value.receiptPath).toMatch(/\.png$/);
    }
  });

  it("edits a split to exact amounts after the fact and keeps the history", async () => {
    const { c, tripId, seat } = await setup();
    const dinner = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: 184_000,
      title: "Cena",
      split: { method: "equal", participants: [seat("Mateo"), seat("Ana"), seat("Juli")] },
    });
    if (!dinner.ok) throw dinner.error;
    const id = dinner.value.expense.id;
    // Ana only had a soup: 30.000; the other two split the rest.
    const edited = await c.ledger.editExpenseMoney(DEMO_PRINCIPAL, tripId, id, 1, {
      currency: "COP",
      amount: 184_000,
      split: { method: "exact", shares: [{ seatId: seat("Mateo"), amount: 77_000 }, { seatId: seat("Ana"), amount: 30_000 }, { seatId: seat("Juli"), amount: 77_000 }] },
    });
    if (!edited.ok) throw edited.error;
    const detail = await c.ledger.getExpense(DEMO_PRINCIPAL, tripId, id);
    if (!detail.ok) throw detail.error;
    expect(detail.value.splitMethod).toBe("exact");
    expect(detail.value.shares.find((s) => s.seatId === seat("Ana"))!.amount).toBe(30_000);
    expect(detail.value.history.map((h) => h.kind)).toEqual(["created", "money_changed"]);
    const stale = await c.ledger.editExpenseMoney(DEMO_PRINCIPAL, tripId, id, 1, { currency: "COP", amount: 1_000 });
    expect(!stale.ok && stale.error.code).toBe("conflict");

    expect((await c.ledger.deleteExpense(DEMO_PRINCIPAL, tripId, id)).ok).toBe(true);
    const gone = await c.ledger.getExpense(DEMO_PRINCIPAL, tripId, id);
    expect(!gone.ok && gone.error.code).toBe("not_found");
    const list = await c.ledger.listTripExpenses(DEMO_PRINCIPAL, tripId);
    expect(list.ok && list.value.some((e) => e.id === id)).toBe(false);
  });

  it("offers quick-add presets: same as last, and saved groups shared by the trip", async () => {
    const { c, tripId, seat } = await setup();
    const before = await c.ledger.getQuickAddDefaults(DEMO_PRINCIPAL, tripId);
    if (!before.ok) throw before.error;
    expect(before.value.groups).toEqual([]);

    const pair = [seat("Mateo"), seat("Ana")];
    for (let i = 0; i < 2; i++) {
      const r = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
        currency: "COP",
        amount: 50_000,
        split: { method: "equal", participants: pair },
      });
      if (!r.ok) throw r.error;
    }
    const saved = await c.ledger.saveSplitGroup(DEMO_PRINCIPAL, tripId, { name: "Carro 1", seatIds: [seat("Ana"), seat("Leo")] });
    if (!saved.ok) throw saved.error;
    const dup = await c.ledger.saveSplitGroup(DEMO_PRINCIPAL, tripId, { name: "carro 1", seatIds: pair });
    expect(!dup.ok && dup.error.code).toBe("validation");

    const after = await c.ledger.getQuickAddDefaults(DEMO_PRINCIPAL, tripId);
    if (!after.ok) throw after.error;
    expect(after.value).toMatchObject({ participants: pair, sameAsLast: pair, preselected: true });
    expect(after.value.groups).toEqual([{ id: saved.value.id, name: "Carro 1", seatIds: [seat("Ana"), seat("Leo")], canDelete: true }]);

    const removed = await c.ledger.deleteSplitGroup(DEMO_PRINCIPAL, tripId, saved.value.id);
    expect(removed.ok).toBe(true);
    const gone = await c.ledger.getQuickAddDefaults(DEMO_PRINCIPAL, tripId);
    expect(gone.ok && gone.value.groups).toEqual([]);
  });

  it("returns a duplicate warning on quick add and blocks strangers", async () => {
    const { c, tripId } = await setup();
    const first = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "COP", amount: 184_000 });
    const second = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "COP", amount: 184_000 });
    expect(first.ok).toBe(true);
    expect(second.ok && second.value.warnings.map((w) => w.code)).toEqual(["possible_duplicate"]);
    const stranger = await c.ledger.recordExpense(PrincipalId("nobody"), tripId, { currency: "COP", amount: 1000 });
    expect(!stranger.ok && stranger.error.code).toBe("forbidden");
  });

  it("refuses to remove a seat that has expenses", async () => {
    const { c, tripId, seat } = await setup();
    const r = await c.membership.removeSeat(DEMO_PRINCIPAL, tripId, seat("Caro"));
    expect(!r.ok && r.error.code).toBe("invalid_state");
  });

  it("detects a stale money edit as a conflict", async () => {
    const { c, tripId } = await setup();
    const created = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "COP", amount: 60_000 });
    if (!created.ok) throw created.error;
    const id = created.value.expense.id;
    const a = await c.ledger.editExpenseMoney(DEMO_PRINCIPAL, tripId, id, 1, { currency: "COP", amount: 66_000 });
    const b = await c.ledger.editExpenseMoney(DEMO_PRINCIPAL, tripId, id, 1, { currency: "COP", amount: 70_000 });
    expect(a.ok).toBe(true);
    expect(!b.ok && b.error.code).toBe("conflict");
  });

  it("previews a personal link without a session, then reports who holds it", async () => {
    const { c, tripId, seat } = await setup();
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const token = invite.value.token;
    const juli = { id: PrincipalId("guest-juli"), kind: "guest" as const };

    const before = await c.membership.previewInvite(tripId, token, null);
    expect(before.ok && before.value).toMatchObject({ seatName: "Juli", organizer: "Mateo", state: "open" });
    const organizer = await c.membership.previewInvite(tripId, token, DEMO_PRINCIPAL);
    expect(organizer.ok && organizer.value.state).toBe("member");
    await c.membership.claimWithInvite(tripId, token, juli);
    const mine = await c.membership.previewInvite(tripId, token, juli.id);
    const stranger = await c.membership.previewInvite(tripId, token, PrincipalId("someone-else"));
    const member = await c.membership.previewInvite(tripId, token, DEMO_PRINCIPAL);
    expect(mine.ok && mine.value.state).toBe("mine");
    expect(stranger.ok && stranger.value.state).toBe("taken");
    expect(member.ok && member.value.state).toBe("member");

    const wrong = await c.membership.previewInvite(tripId, "not-a-token", null);
    expect(!wrong.ok && wrong.error.code).toBe("forbidden");
  });

  it("shares payment details only with people who owe you", async () => {
    const { c, tripId, seat } = await setup();
    const saved = await c.settlement.setMyHandles(DEMO_PRINCIPAL, tripId, [{ kind: "breb", value: "@mateo" }]);
    expect(saved.ok && saved.value).toEqual([{ kind: "breb", value: "@mateo" }]);
    const mine = await c.settlement.getMyHandles(DEMO_PRINCIPAL, tripId);
    expect(mine.ok && mine.value).toEqual([{ kind: "breb", value: "@mateo" }]);

    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const juli = { id: PrincipalId("guest-juli"), kind: "guest" as const };
    await c.membership.claimWithInvite(tripId, invite.value.token, juli);
    // In the Cartagena plan Juli owes Mateo, so she sees how to pay him; Mateo owes nobody.
    const forJuli = await c.settlement.getHandlesToPay(juli.id, tripId);
    expect(forJuli.ok && forJuli.value).toEqual([{ seatId: seat("Mateo"), handles: [{ kind: "breb", value: "@mateo" }] }]);
    const forMateo = await c.settlement.getHandlesToPay(DEMO_PRINCIPAL, tripId);
    expect(forMateo.ok && forMateo.value).toEqual([]);
  });

  it("joins through the generic link: pick a name, wait, get approved", async () => {
    const { c, tripId, seat } = await setup();
    const link = await c.membership.issueJoinLink(DEMO_PRINCIPAL, tripId);
    if (!link.ok) throw link.error;
    const leo = { id: PrincipalId("guest-leo"), kind: "guest" as const };

    const preview = await c.membership.previewJoinLink(tripId, link.value.token, null);
    if (!preview.ok) throw preview.error;
    expect(preview.value.state).toBe("open");
    expect(preview.value.seats.map((s) => s.firstName)).toContain("Leo");
    expect(preview.value.seats.map((s) => s.firstName)).not.toContain("Mateo");

    expect((await c.membership.requestJoin(tripId, link.value.token, leo, { seatId: seat("Leo") })).ok).toBe(true);
    const waiting = await c.membership.previewJoinLink(tripId, link.value.token, leo.id);
    expect(waiting.ok && waiting.value).toMatchObject({ state: "pending", pendingSeatName: "Leo" });
    const blind = await c.membership.getTrip(leo.id, tripId);
    expect(!blind.ok && blind.error.code).toBe("forbidden");

    // "No estoy en la lista" stays out of splits and balances until approved.
    const sofi = { id: PrincipalId("guest-sofi"), kind: "guest" as const };
    expect((await c.membership.requestJoin(tripId, link.value.token, sofi, { newName: "Sofi" })).ok).toBe(true);
    const balances = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    const sofiSeat = (await c.membership.getTrip(DEMO_PRINCIPAL, tripId));
    if (!sofiSeat.ok || !balances.ok) throw new Error("setup");
    const pendingSofi = sofiSeat.value.seats.find((s) => s.displayName === "Sofi")!;
    expect(pendingSofi.awaitingApproval).toBe(true);
    expect(balances.value.balances.some((b) => b.seatId === pendingSofi.id)).toBe(false);

    expect((await c.membership.approveClaim(DEMO_PRINCIPAL, tripId, seat("Leo"))).ok).toBe(true);
    const inside = await c.membership.getTrip(leo.id, tripId);
    expect(inside.ok && inside.value.mySeatId).toBe(seat("Leo"));
  });

  it("turns a guest's seats into account seats when they save their access", async () => {
    const { c, tripId, seat } = await setup();
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Ana"));
    if (!invite.ok) throw invite.error;
    const ana = { id: PrincipalId("guest-ana"), kind: "guest" as const };
    await c.membership.claimWithInvite(tripId, invite.value.token, ana);

    expect((await c.membership.guestSavedAccess(ana.id)).ok).toBe(true);
    const trip = await c.membership.getTrip(ana.id, tripId);
    expect(trip.ok && trip.value.seats.find((s) => s.id === seat("Ana"))?.linkKind).toBe("user");
  });
});

describe("Foreign-currency expenses", () => {
  const build = async (rates: FixedRateProvider | null) => {
    const c = createMemoryContainer({ clock: fixedClock("2026-11-22T20:00:00-05:00"), ids: sequentialIds("fx"), rates });
    const tripId = await seedCartagena(c);
    return { c, tripId };
  };

  it("freezes the day's rate on creation and keeps it through edits", async () => {
    const rates = new FixedRateProvider({ "USD:COP": "4000" });
    const { c, tripId } = await build(rates);
    const quote = await c.ledger.quoteRate(DEMO_PRINCIPAL, tripId, "USD");
    expect(quote.ok && quote.value.rate).toBe("4000");
    const r = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "USD", amount: 2_550 });
    if (!r.ok) throw r.error;
    expect(r.value.expense).toMatchObject({ amount: 2_550, baseAmount: 102_000, fxRate: "4000", fxSource: "api", ratePending: false });

    // The provider moves, the expense doesn't: an edit keeps the frozen rate.
    (rates as unknown as { rates: Record<string, string> }).rates["USD:COP"] = "5000";
    const edited = await c.ledger.editExpenseMoney(DEMO_PRINCIPAL, tripId, r.value.expense.id, 1, { currency: "USD", amount: 3_000 });
    expect(edited.ok && edited.value).toMatchObject({ baseAmount: 120_000, fxRate: "4000" });
  });

  it("waits for a rate when none can be had, then takes the card charge", async () => {
    const { c, tripId } = await build(null);
    const r = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, { currency: "EUR", amount: 1_000 });
    if (!r.ok) throw r.error;
    expect(r.value.expense).toMatchObject({ ratePending: true, baseAmount: null });
    const before = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);

    const noRate = await c.ledger.setExpenseRate(DEMO_PRINCIPAL, tripId, r.value.expense.id, 1, {});
    expect(!noRate.ok && noRate.error.code).toBe("invalid_state");
    const charged = await c.ledger.setExpenseRate(DEMO_PRINCIPAL, tripId, r.value.expense.id, 1, { cardCharge: 47_300 });
    expect(charged.ok && charged.value).toMatchObject({ ratePending: false, baseAmount: 47_300, fxSource: "card_charge" });
    const after = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    // Now it counts: Mateo paid 47.300 and owes his share of it.
    const myShare = charged.ok ? charged.value.myShare! : 0;
    expect(after.ok && before.ok && after.value.myBalance - before.value.myBalance).toBe(47_300 - myShare);
  });
});

describe("Read-only summary link", () => {
  it("shows totals and who pays whom to whoever has the link, until it's turned off", async () => {
    const { c, tripId, seat } = await setup();
    expect((await c.settlement.getSummaryLink(DEMO_PRINCIPAL, tripId)).ok && null).toBeNull();
    const created = await c.settlement.createSummaryLink(DEMO_PRINCIPAL, tripId);
    if (!created.ok) throw created.error;
    expect(created.value.length).toBeGreaterThanOrEqual(24);

    const summary = await c.settlement.publicSummary(created.value);
    if (!summary.ok) throw summary.error;
    expect(summary.value.total).toBe(4_332_000);
    expect(summary.value.plan).toHaveLength(5);
    expect(summary.value.people.find((p) => p.seatId === seat("Mateo"))).toMatchObject({ paid: 2_400_000, balance: 1_687_000 });
    const info = await c.membership.publicTripInfo(summary.value.tripId);
    expect(info.ok && info.value.name).toBe("Cartagena");

    // A member can't create or turn it off; the admin can.
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const juli = PrincipalId("guest-juli");
    await c.membership.claimWithInvite(tripId, invite.value.token, { id: juli, kind: "guest" });
    expect((await c.settlement.createSummaryLink(juli, tripId)).ok).toBe(false);
    const seen = await c.settlement.getSummaryLink(juli, tripId);
    expect(seen.ok && seen.value).toBe(created.value);
    await c.settlement.revokeSummaryLink(DEMO_PRINCIPAL, tripId);
    const gone = await c.settlement.publicSummary(created.value);
    expect(!gone.ok && gone.error.code).toBe("not_found");
    expect((await c.settlement.publicSummary("short")).ok).toBe(false);
  });
});

describe("La vaca", () => {
  it("takes contributions, pays expenses and refunds the leftover through its holder", async () => {
    const { c, tripId, seat } = await setup();
    // Mateo (owner) keeps the vaca; Juli joins and puts money in.
    expect((await c.membership.createPot(DEMO_PRINCIPAL, tripId, seat("Mateo"))).ok).toBe(true);
    const again = await c.membership.createPot(DEMO_PRINCIPAL, tripId, seat("Mateo"));
    expect(!again.ok && again.error.code).toBe("conflict");
    const trip = await c.membership.getTrip(DEMO_PRINCIPAL, tripId);
    if (!trip.ok) throw trip.error;
    const vaca = trip.value.pot!.seatId;
    expect(trip.value.seats.some((s) => s.id === vaca)).toBe(false);

    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, seat("Juli"));
    if (!invite.ok) throw invite.error;
    const juli = PrincipalId("guest-juli");
    await c.membership.claimWithInvite(tripId, invite.value.token, { id: juli, kind: "guest" });
    const put = await c.settlement.recordSettlement(juli, tripId, { from: seat("Juli"), to: vaca, amount: 300_000, method: "nequi" });
    if (!put.ok) throw put.error;
    expect(put.value.status).toBe("pending");
    // Mateo keeps it, so he confirms what reached the vaca.
    expect((await c.settlement.confirmSettlement(DEMO_PRINCIPAL, tripId, put.value.id)).ok).toBe(true);
    const mine = await c.settlement.recordSettlement(DEMO_PRINCIPAL, tripId, { from: seat("Leo"), to: vaca, amount: 100_000, method: "cash" });
    expect(mine.ok && mine.value.status).toBe("confirmed");

    const owes = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: 10_000,
      split: { method: "equal", participants: [vaca, seat("Leo")] },
    });
    expect(!owes.ok && owes.error.message).toMatch(/vaca/);
    const paid = await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: 240_000,
      title: "Almuerzo",
      payers: [{ seatId: vaca }],
      split: { method: "equal", participants: [seat("Juli"), seat("Leo"), seat("Mateo")] },
    });
    if (!paid.ok) throw paid.error;

    const b = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!b.ok) throw b.error;
    expect(b.value.pot).toMatchObject({ seatId: vaca, holderSeatId: seat("Mateo"), cash: 160_000 });
    expect(b.value.balances.some((x) => x.seatId === vaca)).toBe(false);
    // 160.000 left: 3/4 to Juli, 1/4 to Leo, handed out by Mateo.
    expect(b.value.plan).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: vaca, to: seat("Juli"), amount: 120_000 }),
        expect.objectContaining({ from: vaca, to: seat("Leo"), amount: 40_000 }),
      ]),
    );
  });
});

describe("La vaca while Liquidando", () => {
  it("keeps refunding the vaca's leftover to contributors after the plan froze", async () => {
    const { c, tripId, seat } = await setup();
    await c.membership.startSettling(DEMO_PRINCIPAL, tripId);
    const before = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!before.ok) throw before.error;
    await c.membership.createPot(DEMO_PRINCIPAL, tripId, seat("Mateo"));
    const trip = await c.membership.getTrip(DEMO_PRINCIPAL, tripId);
    const vaca = trip.ok ? trip.value.pot!.seatId : (null as never);
    // Mateo records that Leo put 60.000 in.
    await c.settlement.recordSettlement(DEMO_PRINCIPAL, tripId, { from: seat("Leo"), to: vaca, amount: 60_000, method: "cash" });
    const after = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!after.ok) throw after.error;
    expect(after.value.pot?.cash).toBe(60_000);
    expect(after.value.plan.filter((t) => t.from === vaca || t.to === vaca)).toEqual([
      { from: vaca, to: seat("Leo"), amount: 60_000, adjusted: false, pendingSettlementId: null },
    ]);
    // People's frozen rows don't move.
    expect(after.value.plan.filter((t) => t.from !== vaca && t.to !== vaca)).toEqual(before.value.plan);
  });
});

describe("Liquidando and Cerrado", () => {
  const joinJuli = async (c: Awaited<ReturnType<typeof setup>>["c"], tripId: Awaited<ReturnType<typeof setup>>["tripId"], juliSeat: SeatId) => {
    const invite = await c.membership.issueInvite(DEMO_PRINCIPAL, tripId, juliSeat);
    if (!invite.ok) throw invite.error;
    const juli = PrincipalId("guest-juli");
    await c.membership.claimWithInvite(tripId, invite.value.token, { id: juli, kind: "guest" });
    return juli;
  };

  it("freezes the plan and only adds adjustments for later changes (R9)", async () => {
    const { c, tripId, seat } = await setup();
    const before = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    if (!before.ok) throw before.error;
    expect(before.value).toMatchObject({ phase: "active", frozenAt: null });

    expect((await c.membership.startSettling(DEMO_PRINCIPAL, tripId)).ok).toBe(true);
    expect((await c.settlement.freezePlan(DEMO_PRINCIPAL, tripId)).ok).toBe(true);
    await c.ledger.recordExpense(DEMO_PRINCIPAL, tripId, {
      currency: "COP",
      amount: 60_000,
      title: "Taxi",
      payers: [{ seatId: seat("Ana") }],
      split: { method: "equal", participants: [seat("Ana"), seat("Leo")] },
    });

    // The mode switch no longer changes anything once frozen.
    const after = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId, "direct");
    if (!after.ok) throw after.error;
    expect(after.value.phase).toBe("settling");
    expect(after.value.frozenAt).not.toBeNull();
    expect(after.value.plan.filter((t) => !t.adjusted)).toEqual(before.value.plan);
    expect(after.value.plan.filter((t) => t.adjusted)).toEqual([
      { from: seat("Leo"), to: seat("Ana"), amount: 30_000, adjusted: true, pendingSettlementId: null },
    ]);
  });

  it("freezes on the first read when the freeze after starting was missed", async () => {
    const { c, tripId } = await setup();
    await c.membership.startSettling(DEMO_PRINCIPAL, tripId);
    const r = await c.settlement.getTripBalances(DEMO_PRINCIPAL, tripId);
    expect(r.ok && r.value.frozenAt).toBe("2026-11-23T01:00:00.000Z");
  });

  it("closes only with no pending payments, then is read-only until the owner reopens", async () => {
    const { c, tripId, seat } = await setup();
    const juli = await joinJuli(c, tripId, seat("Juli"));
    expect((await c.membership.startSettling(juli, tripId)).ok).toBe(false);
    await c.membership.startSettling(DEMO_PRINCIPAL, tripId);
    const paid = await c.settlement.recordSettlement(juli, tripId, { from: seat("Juli"), to: seat("Mateo"), amount: 641_000, method: "nequi" });
    if (!paid.ok) throw paid.error;

    const blocked = await c.membership.closeTrip(DEMO_PRINCIPAL, tripId);
    expect(!blocked.ok && blocked.error).toMatchObject({ code: "invalid_state", details: { pendingSettlements: 1 } });

    await c.settlement.confirmSettlement(DEMO_PRINCIPAL, tripId, paid.value.id);
    expect((await c.membership.closeTrip(juli, tripId)).ok).toBe(false);
    expect((await c.membership.closeTrip(DEMO_PRINCIPAL, tripId)).ok).toBe(true);

    const expense = await c.ledger.recordExpense(juli, tripId, { currency: "COP", amount: 10_000 });
    expect(!expense.ok && expense.error.code).toBe("invalid_state");
    const payment = await c.settlement.recordSettlement(DEMO_PRINCIPAL, tripId, { from: seat("Leo"), to: seat("Mateo"), amount: 1_000, method: "cash" });
    expect(!payment.ok && payment.error.code).toBe("invalid_state");
    const closed = await c.settlement.getTripBalances(juli, tripId);
    expect(closed.ok && closed.value.phase).toBe("closed");

    expect((await c.membership.reopenTrip(juli, tripId)).ok).toBe(false);
    expect((await c.membership.reopenTrip(DEMO_PRINCIPAL, tripId)).ok).toBe(true);
    const reopened = await c.membership.getTrip(DEMO_PRINCIPAL, tripId);
    expect(reopened.ok && reopened.value.status).toBe("settling");
  });

  it("keeps questions from \"Revisa tu parte\" between the person and the admins", async () => {
    const { c, tripId, seat } = await setup();
    const juli = await joinJuli(c, tripId, seat("Juli"));
    const early = await c.settlement.reviewMyShare(juli, tripId, { status: "ok" });
    expect(!early.ok && early.error.code).toBe("invalid_state");

    await c.membership.startSettling(DEMO_PRINCIPAL, tripId);
    const empty = await c.settlement.reviewMyShare(juli, tripId, { status: "question", note: "  " });
    expect(!empty.ok && empty.error.code).toBe("validation");
    await c.settlement.reviewMyShare(juli, tripId, { status: "question", note: "¿La lancha era para todos?" });
    await c.settlement.reviewMyShare(DEMO_PRINCIPAL, tripId, { status: "ok" });

    const admin = await c.settlement.listShareReviews(DEMO_PRINCIPAL, tripId);
    expect(admin.ok && admin.value).toEqual({
      ok: 1,
      questions: [expect.objectContaining({ seatId: seat("Juli"), note: "¿La lancha era para todos?" })],
    });
    const member = await c.settlement.listShareReviews(juli, tripId);
    expect(member.ok && member.value).toEqual({ ok: 1, questions: [] });
    const mine = await c.settlement.getMyShareReview(juli, tripId);
    expect(mine.ok && mine.value?.status).toBe("question");
  });
});

describe("Concurrent trip writes", () => {
  /** A repository whose first `failures` saves lose a race, like save_trip's version check. */
  class RacyTrips extends InMemoryTripRepository {
    failures = 0;
    override async save(trip: Trip) {
      if (this.failures-- > 0) throw conflict("lost the race");
      return super.save(trip);
    }
  }

  const build = (trips: InMemoryTripRepository) =>
    new TripMembershipUseCases({
      trips,
      tokens: hashTokenService,
      settlements: { hasSettlements: async () => false },
      seatUsage: { isSeatUsed: async () => false },
      closeChecks: { pending: async () => ({ drafts: 0, pendingSettlements: 0, pendingApprovals: 0 }) },
      ids: sequentialIds("r"),
      clock: fixedClock("2026-11-22T20:00:00-05:00"),
    });

  it("retries on fresh data when another write got there first", async () => {
    const trips = new RacyTrips();
    const uc = build(trips);
    const created = await uc.createTrip({ principal: { id: DEMO_PRINCIPAL, kind: "user" }, displayName: "Mateo", name: "Tayrona", baseCurrency: "COP" });
    if (!created.ok) throw created.error;
    trips.failures = 2;
    const added = await uc.addSeat(DEMO_PRINCIPAL, created.value.id, "Leo");
    expect(added.ok && added.value.seats.map((s) => s.displayName)).toEqual(["Mateo", "Leo"]);
  });

  it("gives up after three lost races", async () => {
    const trips = new RacyTrips();
    const uc = build(trips);
    const created = await uc.createTrip({ principal: { id: DEMO_PRINCIPAL, kind: "user" }, displayName: "Mateo", name: "Tayrona", baseCurrency: "COP" });
    if (!created.ok) throw created.error;
    trips.failures = 3;
    const added = await uc.addSeat(DEMO_PRINCIPAL, created.value.id, "Leo");
    expect(!added.ok && added.error.code).toBe("conflict");
  });
});
