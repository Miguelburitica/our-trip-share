import Link from "next/link";
import { dayKey, expenseTitle, fmt } from "@/app/ui/money";
import { dismissNoticeAction } from "./actions";
import { loadTrip } from "./data";

export default async function Inicio({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId: raw } = await params;
  const { c, principal, tripId, trip, nameOf } = await loadTrip(raw);
  const [balances, expenses, notices] = await Promise.all([
    c.settlement.getTripBalances(principal, tripId),
    c.ledger.listTripExpenses(principal, tripId),
    c.settlement.listMyNotices(principal, tripId),
  ]);
  if (!balances.ok || !expenses.ok || !notices.ok) throw new Error("No pudimos cargar el viaje");
  const b = balances.value;
  const owedToMe = b.myBalance > 0;
  const payers = b.plan.filter((t) => t.to === b.mySeatId).map((t) => nameOf(t.from));
  const myDebts = b.plan.filter((t) => t.from === b.mySeatId);
  const mine = owedToMe ? b.plan.filter((t) => t.to === b.mySeatId) : myDebts;
  const pendingForMe = b.pending.filter((p) => p.to === b.mySeatId);
  const drafts = expenses.value.filter((e) => e.status === "draft");
  const me = trip.seats.find((s) => s.id === trip.mySeatId);
  const joinRequests = trip.seats.filter(
    (s) => s.pendingClaim && (me?.role === "owner" || me?.role === "admin" || s.createdBy === trip.mySeatId),
  ).length;
  const lastDay = expenses.value[0] ? dayKey(expenses.value[0].occurredAt) : null;
  const latest = expenses.value.filter((e) => e.status === "complete" && dayKey(e.occurredAt) === lastDay).slice(0, 3);
  const base = `/t/${tripId}`;

  return (
    <main className="flex flex-col gap-8 px-5 pt-14 pb-36">
      <header className="px-1">
        <h1 className="text-[22px] font-bold tracking-tight">{trip.name}</h1>
        <p className="text-sm text-muted">{trip.seats.length} personas</p>
      </header>

      <section aria-label="Tu saldo" className="flex flex-col gap-5 rounded-[28px] bg-tint px-6 py-7">
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-medium text-muted">
            {b.myBalance === 0 ? "Estás a paz y salvo" : owedToMe ? "Te deben" : "Debes"}
          </span>
          <span
            className={`tabular text-5xl leading-none font-bold tracking-tight ${owedToMe || b.myBalance === 0 ? "" : "text-accent-text"}`}
          >
            {fmt(Math.abs(b.myBalance), b.baseCurrency)}
          </span>
          <span className="text-sm text-muted">
            {owedToMe
              ? new Intl.ListFormat("es", { type: "conjunction" }).format(payers)
              : myDebts.map((t) => `a ${nameOf(t.to)}`).join(", ")}
            {pendingForMe.length > 0 && ` · ${pendingForMe.length} por confirmar`}
          </span>
        </div>
        <div className="flex items-center gap-5">
          {mine.length > 0 && (
            <Link
              href={mine.length === 1 ? `${base}/cuentas?abrir=${owedToMe ? mine[0].from : mine[0].to}` : `${base}/cuentas`}
              className="flex min-h-[50px] items-center rounded-full bg-accent px-7 text-base font-semibold text-white"
            >
              {owedToMe ? "Cobrar" : "Pagar"}
            </Link>
          )}
          <Link href={`${base}/cuentas`} className="flex min-h-11 items-center text-[15px] font-semibold">
            Ver cuentas
          </Link>
        </div>
      </section>

      {(pendingForMe.length > 0 || drafts.length > 0 || notices.value.length > 0 || joinRequests > 0) && (
        <section aria-label="Para ti" className="flex flex-col gap-3">
          <h2 className="px-1 text-[15px] font-semibold">Para ti</h2>
          {joinRequests > 0 && (
            <Link href={`${base}/viaje`} className="flex items-center gap-3.5 rounded-[22px] bg-surface px-4.5 py-4 shadow-card">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">
                  {joinRequests === 1 ? "Alguien quiere entrar al viaje" : `${joinRequests} personas quieren entrar`}
                </span>
                <span className="text-sm text-muted">Apruébalos en Viaje</span>
              </span>
              <Chevron />
            </Link>
          )}
          {notices.value.slice(0, 3).map((n) => (
            <div key={n.id} role="status" className="flex items-center gap-3.5 rounded-[22px] bg-accent-soft px-4.5 py-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold text-accent-text">
                  Tu saldo cambió: {n.delta < 0 ? "debes" : "te deben"} {fmt(Math.abs(n.delta), b.baseCurrency)} más
                </span>
                <span className="text-sm text-accent-text/80">
                  {expenseTitle({ title: n.cause.title, category: n.cause.category, status: "complete" })} ·{" "}
                  {nameOf(n.by)} {NOTICE_VERB[n.cause.kind]}
                </span>
              </span>
              <form action={dismissNoticeAction.bind(null, tripId, n.id)}>
                <button type="submit" className="flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold">
                  Entendido
                </button>
              </form>
            </div>
          ))}
          {(pendingForMe.length > 0 || drafts.length > 0) && (
          <Link href={pendingForMe.length ? `${base}/cuentas` : `${base}/gastos`} className="flex items-center gap-3.5 rounded-[22px] bg-surface px-4.5 py-4 shadow-card">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">
                {pendingForMe.length
                  ? `${nameOf(pendingForMe[0].from)} dice que te pagó ${fmt(pendingForMe[0].baseAmount, b.baseCurrency)}`
                  : `${drafts.length} recibo sin monto`}
              </span>
              <span className="text-sm text-muted">
                {pendingForMe.length ? "¿Te llegó?" : "Complétalo"}
                {pendingForMe.length + drafts.length > 1 && ` · y ${pendingForMe.length + drafts.length - 1} más`}
              </span>
            </span>
            <Chevron />
          </Link>
          )}
        </section>
      )}

      {latest.length > 0 && (
        <section aria-label="Lo último" className="flex flex-col gap-3">
          <h2 className="px-1 text-[15px] font-semibold">Lo último</h2>
          <div className="flex flex-col rounded-[22px] bg-surface px-4.5 py-1.5 shadow-card">
            {latest.map((e) => (
              <div key={e.id} className="flex min-h-[60px] items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{expenseTitle(e)}</span>
                  <span className="text-[13px] text-muted">{nameOf(e.payers[0]?.seatId)}</span>
                </span>
                {e.myShare !== null ? (
                  <span className="tabular text-[15px] font-semibold">{fmt(e.myShare, b.baseCurrency)}</span>
                ) : (
                  <span className="text-sm text-muted">No estás</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

const NOTICE_VERB = { created: "lo agregó", edited: "lo editó", deleted: "lo borró" } as const;

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
