import { describe, expect, it } from "vitest";
import { PrincipalId, SeatId, TripId, sequentialIds } from "@/shared-kernel/ids";
import { DomainError } from "@/shared-kernel/errors";
import { Trip } from "./trip";

const now = new Date("2026-11-20T10:00:00Z");
const mateo = { id: PrincipalId("p-mateo"), kind: "user" as const, displayName: "Mateo" };

function cartagena() {
  const ids = sequentialIds("seat");
  return Trip.create({
    id: TripId("trip-1"),
    name: "Cartagena",
    baseCurrency: "COP",
    startDate: "2026-11-20",
    endDate: "2026-11-24",
    creator: mateo,
    people: ["Ana", "Leo", "Caro", "Juli", "Andrés"],
    newSeatId: () => SeatId(ids.next()),
    now,
  });
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  return "ok";
};

const seatNamed = (trip: Trip, name: string) => trip.allSeats.find((s) => s.displayName === name)!;
const owner = (trip: Trip) => trip.owner.id;

describe("Create a trip with people", () => {
  it("creates Cartagena with 6 seats and Mateo as owner", () => {
    const trip = cartagena();
    expect(trip.status).toBe("active");
    expect(trip.baseCurrency).toBe("COP");
    expect(trip.allSeats).toHaveLength(6);
    expect(trip.owner.displayName).toBe("Mateo");
    expect(trip.owner.principalId).toBe("p-mateo");
  });

  it("rejects an empty name", () => {
    expect(
      code(() =>
        Trip.create({ id: TripId("t"), name: "   ", baseCurrency: "COP", creator: mateo, newSeatId: () => SeatId("s"), now }),
      ),
    ).toBe("validation");
  });

  it("de-duplicates names ignoring case and spaces", () => {
    const ids = sequentialIds("s");
    const trip = Trip.create({
      id: TripId("t"),
      name: "Test",
      baseCurrency: "COP",
      creator: mateo,
      people: ["Ana", " ana ", "Leo"],
      newSeatId: () => SeatId(ids.next()),
      now,
    });
    expect(trip.allSeats.map((s) => s.displayName)).toEqual(["Mateo", "Ana", "Leo"]);
  });

  it("rejects an end date before the start date", () => {
    expect(
      code(() =>
        Trip.create({
          id: TripId("t"),
          name: "X",
          baseCurrency: "COP",
          startDate: "2026-11-24",
          endDate: "2026-11-20",
          creator: mateo,
          newSeatId: () => SeatId("s"),
          now,
        }),
      ),
    ).toBe("validation");
  });

  it("rejects unsupported currencies", () => {
    expect(
      code(() => Trip.create({ id: TripId("t"), name: "X", baseCurrency: "XXX", creator: mateo, newSeatId: () => SeatId("s"), now })),
    ).toBe("validation");
  });
});

describe("Trip lifecycle", () => {
  it("lets an admin start settling and blocks plain members", () => {
    const trip = cartagena();
    const ana = seatNamed(trip, "Ana");
    trip.issueInvite(owner(trip), ana.id, "hash-ana");
    trip.claimWithInvite("hash-ana", { id: PrincipalId("p-ana"), kind: "guest" });
    expect(code(() => trip.startSettling(ana.id))).toBe("forbidden");
    trip.setRole(owner(trip), ana.id, "admin");
    trip.startSettling(ana.id);
    expect(trip.status).toBe("settling");
  });

  it("closes only with a clean state, and the owner can reopen", () => {
    const trip = cartagena();
    trip.startSettling(owner(trip));
    let error: DomainError | undefined;
    try {
      trip.close(owner(trip), { drafts: 1, pendingSettlements: 1, pendingApprovals: 0 });
    } catch (e) {
      error = e as DomainError;
    }
    expect(error?.code).toBe("invalid_state");
    expect(error?.details).toEqual({ drafts: 1, pendingSettlements: 1 });
    trip.close(owner(trip), { drafts: 0, pendingSettlements: 0, pendingApprovals: 0 });
    expect(trip.status).toBe("closed");
    trip.reopen(owner(trip));
    expect(trip.status).toBe("settling");
  });
});

describe("Base currency lock and settle mode", () => {
  it("changes currency before any settlement and locks after", () => {
    const trip = cartagena();
    trip.changeBaseCurrency(owner(trip), "USD", false);
    expect(trip.baseCurrency).toBe("USD");
    expect(code(() => trip.changeBaseCurrency(owner(trip), "COP", true))).toBe("currency_locked");
  });

  it("requires a hub for hub mode", () => {
    const trip = cartagena();
    expect(code(() => trip.changeSettleMode(owner(trip), "hub", null, false))).toBe("validation");
    trip.changeSettleMode(owner(trip), "hub", owner(trip), false);
    expect(trip.settleMode).toBe("hub");
    expect(trip.hubSeatId).toBe(owner(trip));
  });

  it("locks the mode for non-owner admins after a settlement", () => {
    const trip = cartagena();
    const ana = seatNamed(trip, "Ana");
    trip.issueInvite(owner(trip), ana.id, "h");
    trip.claimWithInvite("h", { id: PrincipalId("p-ana"), kind: "user" });
    trip.setRole(owner(trip), ana.id, "admin");
    expect(code(() => trip.changeSettleMode(ana.id, "direct", null, true))).toBe("forbidden");
    trip.changeSettleMode(owner(trip), "direct", null, true);
    expect(trip.settleMode).toBe("direct");
  });
});

describe("Seats and claims", () => {
  it("links the opener of a personal link immediately", () => {
    const trip = cartagena();
    const juli = seatNamed(trip, "Juli");
    trip.issueInvite(owner(trip), juli.id, "hash-juli");
    trip.claimWithInvite("hash-juli", { id: PrincipalId("p-juli"), kind: "guest" });
    expect(trip.seat(juli.id).link).toEqual({ kind: "guest", principalId: "p-juli" });
  });

  it("re-sending a link moves a seat to a new phone only when the new link is opened", () => {
    const trip = cartagena();
    const juli = seatNamed(trip, "Juli");
    trip.issueInvite(owner(trip), juli.id, "old");
    trip.claimWithInvite("old", { id: PrincipalId("p-juli"), kind: "guest" });
    expect(trip.inviteState("old", PrincipalId("p-x"))).toBe("taken");
    expect(code(() => trip.claimWithInvite("old", { id: PrincipalId("p-x"), kind: "guest" }))).toBe("already_claimed");

    trip.issueInvite(owner(trip), juli.id, "new");
    // Juli keeps access on her old phone until the new link is used.
    expect(trip.seat(juli.id).principalId).toBe("p-juli");
    expect(code(() => trip.claimWithInvite("old", { id: PrincipalId("p-x"), kind: "guest" }))).toBe("forbidden");
    expect(trip.inviteState("new", null)).toBe("recover");

    trip.claimWithInvite("new", { id: PrincipalId("p-juli-2"), kind: "guest" });
    expect(trip.seat(juli.id).principalId).toBe("p-juli-2");
    expect(code(() => trip.claimWithInvite("new", { id: PrincipalId("p-x"), kind: "guest" }))).toBe("already_claimed");
  });

  it("generic link: a visitor asks for a seat, sees nothing until approved, and can be rejected", () => {
    const trip = cartagena();
    const leo = seatNamed(trip, "Leo");
    const visitor = { id: PrincipalId("p-visitor"), kind: "guest" as const };
    expect(code(() => trip.requestClaimWithJoinLink("qr-token", leo.id, visitor, new Date()))).toBe("forbidden");
    trip.issueJoinLink(owner(trip), "qr-token");
    trip.requestClaimWithJoinLink("qr-token", leo.id, visitor, new Date());
    expect(trip.seatOf(visitor.id)).toBeUndefined();
    expect(trip.pendingSeatOf(visitor.id)?.id).toBe(leo.id);

    // Changing their mind moves the request; a new name creates a pending seat.
    trip.requestNewSeatWithJoinLink("qr-token", "Sofi", visitor, SeatId("seat-sofi"), new Date());
    expect(trip.seat(leo.id).pendingClaim).toBeNull();
    expect(trip.pendingSeatOf(visitor.id)?.displayName).toBe("Sofi");
    expect(code(() => trip.requestNewSeatWithJoinLink("qr-token", "leo", visitor, SeatId("x"), new Date()))).toBe("validation");

    trip.rejectClaim(owner(trip), SeatId("seat-sofi"));
    expect(trip.allSeats.some((s) => s.id === "seat-sofi")).toBe(false);

    trip.issueJoinLink(owner(trip), "qr-token-2");
    expect(code(() => trip.requestClaimWithJoinLink("qr-token", leo.id, visitor, new Date()))).toBe("forbidden");
  });

  it("allows one seat per principal", () => {
    const trip = cartagena();
    const juli = seatNamed(trip, "Juli");
    const caro = seatNamed(trip, "Caro");
    trip.issueInvite(owner(trip), juli.id, "j");
    trip.issueInvite(owner(trip), caro.id, "c");
    trip.claimWithInvite("j", { id: PrincipalId("p-juli"), kind: "guest" });
    expect(code(() => trip.claimWithInvite("c", { id: PrincipalId("p-juli"), kind: "guest" }))).toBe("conflict");
  });

  it("rejects a second principal on an already linked seat", () => {
    const trip = cartagena();
    const leo = seatNamed(trip, "Leo");
    trip.issueInvite(owner(trip), leo.id, "l");
    trip.claimWithInvite("l", { id: PrincipalId("p-1"), kind: "guest" });
    expect(code(() => trip.claimWithInvite("l", { id: PrincipalId("p-2"), kind: "guest" }))).toBe("already_claimed");
  });

  it("keeps generic-link claims pending until an admin approves", () => {
    const trip = cartagena();
    const leo = seatNamed(trip, "Leo");
    const visitor = { id: PrincipalId("p-leo"), kind: "guest" as const };
    trip.requestClaim(leo.id, visitor, now);
    expect(trip.seatOf(visitor.id)).toBeUndefined();
    expect(code(() => trip.actor(visitor.id))).toBe("forbidden");

    const caro = seatNamed(trip, "Caro");
    trip.issueInvite(owner(trip), caro.id, "c");
    trip.claimWithInvite("c", { id: PrincipalId("p-caro"), kind: "guest" });
    expect(code(() => trip.approveClaim(caro.id, leo.id))).toBe("forbidden");

    trip.approveClaim(owner(trip), leo.id);
    expect(trip.seatOf(visitor.id)?.id).toBe(leo.id);
  });

  it("lets the seat's creator approve", () => {
    const trip = cartagena();
    const ana = seatNamed(trip, "Ana");
    trip.issueInvite(owner(trip), ana.id, "a");
    trip.claimWithInvite("a", { id: PrincipalId("p-ana"), kind: "user" });
    const sofi = trip.addSeat(ana.id, "Sofi", SeatId("seat-sofi"));
    trip.requestClaim(sofi.id, { id: PrincipalId("p-sofi"), kind: "guest" }, now);
    trip.approveClaim(ana.id, sofi.id);
    expect(trip.seat(sofi.id).principalId).toBe("p-sofi");
  });

  it("creates a pending seat for 'No estoy en la lista'", () => {
    const trip = cartagena();
    const seat = trip.requestNewSeat("Tomás", { id: PrincipalId("p-t"), kind: "guest" }, SeatId("seat-t"), now);
    expect(seat.pendingClaim?.principalId).toBe("p-t");
    expect(seat.isLinked).toBe(false);
  });

  it("unlinks a wrong claim without touching the seat", () => {
    const trip = cartagena();
    const leo = seatNamed(trip, "Leo");
    trip.issueInvite(owner(trip), leo.id, "l");
    trip.claimWithInvite("l", { id: PrincipalId("prank"), kind: "guest" });
    trip.unlinkSeat(owner(trip), leo.id);
    expect(trip.seat(leo.id).isLinked).toBe(false);
    expect(trip.seatOf(PrincipalId("prank"))).toBeUndefined();
  });
});

describe("Roles, leaving and removal", () => {
  it("transfers ownership to an active linked seat", () => {
    const trip = cartagena();
    const ana = seatNamed(trip, "Ana");
    expect(code(() => trip.transferOwnership(owner(trip), ana.id))).toBe("validation");
    trip.issueInvite(owner(trip), ana.id, "a");
    trip.claimWithInvite("a", { id: PrincipalId("p-ana"), kind: "user" });
    const previous = owner(trip);
    trip.transferOwnership(previous, ana.id);
    expect(trip.owner.id).toBe(ana.id);
    expect(trip.seat(previous).role).toBe("admin");
  });

  it("does not let the owner leave without transferring", () => {
    const trip = cartagena();
    expect(code(() => trip.markLeft(owner(trip), owner(trip)))).toBe("forbidden");
  });

  it("removes unused seats only", () => {
    const trip = cartagena();
    const sofi = trip.addSeat(owner(trip), "Sofi", SeatId("seat-sofi"));
    trip.removeSeat(owner(trip), sofi.id, false);
    expect(trip.allSeats.some((s) => s.id === sofi.id)).toBe(false);
    const caro = seatNamed(trip, "Caro");
    expect(code(() => trip.removeSeat(owner(trip), caro.id, true))).toBe("invalid_state");
    trip.markLeft(owner(trip), caro.id);
    expect(trip.seat(caro.id).status).toBe("left");
    expect(trip.defaultParticipantIds()).not.toContain(caro.id);
  });

  it("excludes default-excluded seats from default splits", () => {
    const trip = cartagena();
    const andres = seatNamed(trip, "Andrés");
    trip.setDefaultExcluded(owner(trip), andres.id, true);
    expect(trip.defaultParticipantIds()).toHaveLength(5);
    expect(trip.defaultParticipantIds()).not.toContain(andres.id);
  });

  it("round-trips through primitives", () => {
    const trip = cartagena();
    const copy = Trip.fromPrimitives(trip.toPrimitives());
    expect(copy.toPrimitives()).toEqual(trip.toPrimitives());
  });
});
