import { describe, expect, it } from "vitest";
import { fixedClock, DAY } from "@/shared-kernel/clock";
import { PrincipalId, sequentialIds, type SeatId } from "@/shared-kernel/ids";
import { TripMembershipUseCases } from "@/contexts/trip-membership/application/use-cases";
import type { Trip } from "@/contexts/trip-membership/domain/trip";
import { hashTokenService } from "@/contexts/trip-membership/infrastructure/hash-token-service";
import { InMemoryTripRepository } from "@/contexts/trip-membership/infrastructure/in-memory-trip-repository";
import { conflict } from "@/shared-kernel/errors";
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
    expect(r.value.plan).toContainEqual({ from: seat("Juli"), to: seat("Mateo"), amount: 641_000, pendingSettlementId: null });
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
