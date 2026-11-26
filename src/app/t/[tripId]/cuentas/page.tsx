import Link from "next/link";
import { fmt } from "@/app/ui/money";
import { loadTrip } from "../data";
import { CloseTrip, ReopenTrip, StartSettling } from "./lifecycle";
import { PotSection } from "./pot-section";
import { TransferRow } from "./transfer-sheet";

const day = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

const MODES = [
  { id: "simplified", label: "Simplificado", hint: "Las menos transferencias posibles." },
  { id: "hub", label: "Vía organizador", hint: "Todos le pagan al organizador y él reparte." },
  { id: "direct", label: "Directo", hint: "Cada quien le paga a quien le pagó algo." },
] as const;

export default async function Cuentas({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ modo?: string; abrir?: string }>;
}) {
  const [{ tripId: raw }, { modo, abrir }] = await Promise.all([params, searchParams]);
  const { c, principal, tripId, trip, nameOf } = await loadTrip(raw);
  const mode = MODES.find((m) => m.id === modo)?.id ?? trip.settleMode;
  // Previewing hub mode uses the owner as hub until the trip picks one.
  const result = await c.settlement.getTripBalances(principal, tripId, mode === "hub" && !trip.hubSeatId ? "simplified" : mode);
  if (!result.ok) throw new Error("No pudimos calcular las cuentas");
  const b = result.value;
  const planMode = mode === "hub" && !trip.hubSeatId ? "simplified" : mode;
  const [mine, toPay] = await Promise.all([
    c.settlement.getMyHandles(principal, tripId),
    c.settlement.getHandlesToPay(principal, tripId, planMode),
  ]);
  const myHandles = mine.ok ? mine.value : [];
  const handlesOf = (seatId: string) => (toPay.ok ? (toPay.value.find((h) => h.seatId === seatId)?.handles ?? null) : null);
  const max = Math.max(1, ...b.balances.map((x) => Math.abs(x.balance)));
  const current = MODES.find((m) => m.id === mode)!;
  const names: Record<string, string> = Object.fromEntries(trip.seats.map((s) => [s.id, s.displayName]));
  if (b.pot) names[b.pot.seatId] = "La vaca";
  const potIHold = b.pot && b.pot.holderSeatId === b.mySeatId ? b.pot.seatId : null;
  const isMine = (id: string) => id === b.mySeatId || id === potIHold;
  // ?abrir=<seat> (from Inicio's Cobrar/Pagar) opens my transfer with that person.
  // Pending payments that no longer match a plan row (the plan moved after they were sent) still
  // need the receiver's answer, so they get their own list.
  const looseRows = b.pending
    .filter((p) => (isMine(p.from) || isMine(p.to)) && !b.plan.some((t) => t.pendingSettlementId === p.id))
    .map((p) => ({ from: p.from, to: p.to, amount: p.baseAmount, pendingSettlementId: p.id, pendingAmount: p.baseAmount }));
  const me = trip.seats.find((s) => s.id === trip.mySeatId);
  const canManage = me?.role === "owner" || me?.role === "admin";
  const active = b.phase === "active";
  const closed = b.phase === "closed";
  const people = trip.seats.filter((s) => !s.awaitingApproval).length;
  const [reviews, expenses] = await Promise.all([
    b.phase === "settling" ? c.settlement.listShareReviews(principal, tripId) : null,
    b.phase === "settling" && canManage ? c.ledger.listTripExpenses(principal, tripId) : null,
  ]);
  const questions = reviews?.ok ? reviews.value.questions : [];
  const reviewedOk = reviews?.ok ? reviews.value.ok : 0;
  const drafts = expenses?.ok ? expenses.value.filter((e) => e.status === "draft").length : 0;
  // Closing needs these at zero (the domain checks again); the rest only warn.
  const blockers = [
    drafts > 0 && (drafts === 1 ? "1 recibo sin monto" : `${drafts} recibos sin monto`),
    b.pending.length > 0 && (b.pending.length === 1 ? "1 pago por confirmar" : `${b.pending.length} pagos por confirmar`),
  ].filter((x): x is string => Boolean(x));
  const warnings = [
    b.plan.length > 0 && (b.plan.length === 1 ? "Aún falta 1 pago del plan." : `Aún faltan ${b.plan.length} pagos del plan.`),
    questions.length > 0 && (questions.length === 1 ? "Hay 1 pregunta sin resolver." : `Hay ${questions.length} preguntas sin resolver.`),
  ].filter((x): x is string => Boolean(x));
  const openKey = b.plan.find((t) => (t.from === b.mySeatId && t.to === abrir) || (t.to === b.mySeatId && t.from === abrir));

  return (
    <main className="flex flex-col gap-6 px-5 pt-14 pb-36">
      <header className="flex flex-col gap-1.5 px-1">
        <h1 className="text-3xl font-bold tracking-tight">Cuentas</h1>
        <p className="text-[15px] text-muted">
          {b.myBalance === 0 ? (
            "Estás a paz y salvo"
          ) : (
            <>
              {b.myBalance > 0 ? "Te deben " : "Debes "}
              <strong className="font-bold text-ink">{fmt(Math.abs(b.myBalance), b.baseCurrency)}</strong>
            </>
          )}
        </p>
      </header>

      {!active && (
        <section aria-label="Estado del viaje" className="flex flex-col gap-1 rounded-[28px] bg-tint px-5 py-4.5">
          <p className="text-[15px] font-semibold">
            {closed ? "Viaje cerrado" : "Liquidando"}
            {b.frozenAt && <span className="font-normal text-muted"> · plan fijo desde el {day.format(new Date(b.frozenAt))}</span>}
          </p>
          <p className="text-sm text-ink-2">
            {closed
              ? "Ya no se agregan gastos ni pagos."
              : `${reviewedOk} de ${people} revisaron su parte. Los cambios desde que se congeló salen como ajustes.`}
          </p>
        </section>
      )}

      {active && (
        <div className="flex flex-col gap-2.5">
          <nav aria-label="Cómo saldar" className="grid grid-cols-3 gap-1 rounded-full bg-tint p-1">
            {MODES.map((m) => (
              <Link
                key={m.id}
                href={`/t/${tripId}/cuentas?modo=${m.id}`}
                aria-current={m.id === mode ? "page" : undefined}
                className={`flex min-h-[42px] items-center justify-center rounded-full text-[13px] font-semibold ${m.id === mode ? "bg-surface shadow-card" : "text-muted"}`}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          <p className="px-2 text-sm text-muted">
            {current.hint}
            {mode === "hub" && !trip.hubSeatId && " Elige quién recibe en Viaje › Ajustes."}
          </p>
        </div>
      )}

      <section aria-label="Plan de pagos" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-sm font-semibold text-muted">
          {b.plan.length === 1 ? "1 transferencia" : `${b.plan.length} transferencias`}
          {closed && b.plan.length > 0 && " sin hacer"}
        </h2>
        <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
          {b.plan.map((t) => (
            <TransferRow
              key={`${t.from}-${t.to}`}
              tripId={tripId}
              tripName={trip.name}
              currency={b.baseCurrency}
              transfer={{ ...t, pendingAmount: b.pending.find((p) => p.id === t.pendingSettlementId)?.baseAmount }}
              mySeatId={b.mySeatId}
              names={names}
              myHandles={myHandles}
              theirHandles={handlesOf(t.to)}
              initiallyOpen={t === openKey}
              readOnly={closed}
              potIHold={potIHold}
            />
          ))}
          {b.plan.length === 0 && <li className="py-4 text-muted">Todos están a paz y salvo.</li>}
        </ul>
      </section>

      {looseRows.length > 0 && (
        <section aria-label="Por confirmar" className="flex flex-col gap-2.5">
          <h2 className="px-1 text-sm font-semibold text-muted">Por confirmar</h2>
          <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
            {looseRows.map((t) => (
              <TransferRow
                key={t.pendingSettlementId}
                tripId={tripId}
                tripName={trip.name}
                currency={b.baseCurrency}
                transfer={t}
                mySeatId={b.mySeatId}
                names={names}
                myHandles={myHandles}
                theirHandles={handlesOf(t.to)}
                potIHold={potIHold}
              />
            ))}
          </ul>
        </section>
      )}

      {b.pot && (
        <PotSection
          tripId={tripId}
          currency={b.baseCurrency}
          pot={b.pot}
          mySeatId={b.mySeatId}
          names={names}
          people={trip.seats.filter((s) => s.status === "active" && !s.awaitingApproval).map((s) => ({ id: s.id as string, name: s.displayName }))}
          readOnly={closed}
        />
      )}

      <section aria-label="Saldo por persona" className="flex flex-col gap-3 px-1">
        <h2 className="text-sm font-semibold text-muted">Saldo por persona</h2>
        {[...b.balances]
          .sort((x, y) => y.balance - x.balance)
          .map((x) => (
            <div key={x.seatId} className="grid grid-cols-[64px_1fr_104px] items-center gap-2.5 text-sm">
              <span className="font-medium">{nameOf(x.seatId)}</span>
              <span className="relative h-2 overflow-hidden rounded-full bg-tint">
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${x.balance >= 0 ? "bg-ink" : "bg-accent"}`}
                  style={{ width: `${Math.max(3, Math.round((Math.abs(x.balance) / max) * 100))}%` }}
                />
              </span>
              <span className={`tabular text-right font-semibold ${x.balance < 0 ? "text-accent-text" : ""}`}>
                {x.balance > 0 ? "+" : ""}
                {fmt(x.balance, b.baseCurrency)}
              </span>
            </div>
          ))}
      </section>

      {canManage && questions.length > 0 && (
        <section aria-label="Preguntas" className="flex flex-col gap-2.5">
          <h2 className="px-1 text-[15px] font-semibold">Preguntas sobre su parte</h2>
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <li key={q.seatId} className="flex flex-col gap-1 rounded-[22px] bg-surface px-4.5 py-4 shadow-card">
                <span className="text-[13px] font-semibold text-muted">{nameOf(q.seatId)}</span>
                <span className="text-[15px]">{q.note}</span>
              </li>
            ))}
          </ul>
          <p className="px-1 text-[13px] text-muted">Respóndeles por el chat del viaje. Cuando les quede claro, marcan “Todo bien”.</p>
        </section>
      )}

      {canManage && active && (
        <section aria-label="Liquidar" className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col gap-1 px-1">
            <h2 className="text-[15px] font-semibold">¿Ya volvieron?</h2>
            <p className="text-sm text-muted">Cuando estén todos los gastos, congela el plan para que cada uno sepa a quién pagarle.</p>
          </div>
          <StartSettling tripId={tripId} />
        </section>
      )}

      {canManage && b.phase === "settling" && (
        <section aria-label="Cerrar" className="flex flex-col gap-3 pt-2">
          <div className="flex flex-col gap-1 px-1">
            <h2 className="text-[15px] font-semibold">Cerrar el viaje</h2>
            <p className="text-sm text-muted">
              {blockers.length
                ? `Para cerrar falta resolver: ${new Intl.ListFormat("es", { type: "conjunction" }).format(blockers)}.`
                : "Cuando todos hayan pagado, cierra el viaje para dejarlo solo de lectura."}
            </p>
          </div>
          {blockers.length === 0 && <CloseTrip tripId={tripId} warnings={warnings} />}
        </section>
      )}

      {closed && me?.role === "owner" && (
        <section aria-label="Reabrir" className="pt-2">
          <ReopenTrip tripId={tripId} />
        </section>
      )}
    </main>
  );
}
