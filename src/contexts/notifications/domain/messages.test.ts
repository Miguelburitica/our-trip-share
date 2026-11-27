import { describe, expect, it } from "vitest";
import { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import { changeToApprove, digestMessage, joinRequested, moneyChangeDeliveries, settlementToConfirm, settlingStarted, shareQuestion, type TripDirectory } from "./messages";

const [ana, leo, juli, caro] = ["ana", "leo", "juli", "caro"].map(SeatId);
const dir: TripDirectory = {
  tripId: TripId("t1"),
  tripName: "Cartagena",
  baseCurrency: "COP",
  seats: [
    { seatId: ana, name: "Ana", principalId: PrincipalId("p-ana"), isAdmin: true },
    { seatId: leo, name: "Leo", principalId: PrincipalId("p-leo"), isAdmin: false },
    { seatId: juli, name: "Juli", principalId: PrincipalId("p-juli"), isAdmin: false },
    { seatId: caro, name: "Caro", principalId: null, isAdmin: false },
  ],
};
const seat = (seatId: SeatId, shareBefore: number, shareAfter: number, paidBefore = 0, paidAfter = 0) => ({ seatId, shareBefore, shareAfter, paidBefore, paidAfter });

describe("Who hears about a money change", () => {
  it("tells whoever's share moved more than 10% on an edit, with the diff", () => {
    const out = moneyChangeDeliveries(dir, {
      by: leo,
      kind: "edited",
      what: "Cena",
      expenseId: "e1",
      seats: [seat(ana, 90_000, 108_000), seat(juli, 90_000, 95_000), seat(leo, 90_000, 57_000, 270_000, 260_000)],
    });
    expect(out).toEqual([
      { to: "p-ana", message: { title: "Cartagena", body: "Cena: tu parte $90.000 → $108.000, editado por Leo", url: "/t/t1/gastos/e1", tag: "expense-e1" } },
    ]);
  });

  it("leaves new expenses for the digest, except a payment recorded in someone else's name", () => {
    const out = moneyChangeDeliveries(dir, { by: juli, kind: "created", what: "Peaje", expenseId: "e2", seats: [seat(ana, 0, 6_000), seat(leo, 0, 6_000, 0, 18_000)] });
    expect(out.map((d) => [d.to, d.message.body])).toEqual([["p-leo", "Juli anotó que pagaste $18.000 · Peaje"]]);
  });

  it("covers deletions and never notifies the author or unlinked seats", () => {
    const out = moneyChangeDeliveries(dir, { by: ana, kind: "deleted", what: "Taxi", expenseId: "e3", seats: [seat(ana, 10_000, 0), seat(caro, 10_000, 0), seat(juli, 10_000, 0)] });
    expect(out.map((d) => [d.to, d.message.body, d.message.url])).toEqual([["p-juli", "Taxi: ya no te toca (antes $10.000), por Ana", "/t/t1/gastos"]]);
  });
});

describe("Immediate notices", () => {
  it("asks the receiver (or la vaca's holder) to confirm a payment", () => {
    expect(settlementToConfirm(dir, leo, ana, 50_000)[0]).toMatchObject({ to: "p-ana", message: { body: "Leo dice que te pagó $50.000. Confírmalo." } });
    expect(settlementToConfirm(dir, leo, SeatId("vaca"), 20_000, ana)[0].message.body).toBe("Leo dice que puso $20.000 en la vaca. Confírmalo.");
    expect(settlementToConfirm(dir, leo, caro, 1)).toEqual([]);
  });

  it("goes to admins for join requests, questions and changes to approve; to everyone else when settling starts", () => {
    expect(joinRequested(dir, "Mateo").map((d) => d.to)).toEqual(["p-ana"]);
    expect(shareQuestion(dir, juli, "¿La lancha era para todos?")[0].message.body).toBe("Juli pregunta: “¿La lancha era para todos?”");
    expect(changeToApprove(dir, leo, "Taxi").map((d) => [d.to, d.message.body])).toEqual([["p-ana", "Leo cambió Taxi: falta tu aprobación"]]);
    expect(settlingStarted(dir, ana).map((d) => d.to)).toEqual(["p-leo", "p-juli"]);
  });

  it("sums up the day in the digest", () => {
    expect(digestMessage(dir, 7, -230_000)).toMatchObject({ title: "Hoy en Cartagena", body: "7 gastos · debes $230.000" });
    expect(digestMessage(dir, 1, 0).body).toBe("1 gasto · estás a paz y salvo");
  });
});
