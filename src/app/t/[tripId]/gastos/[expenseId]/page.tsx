import Link from "next/link";
import { notFound } from "next/navigation";
import { expenseTitle, fmt } from "@/app/ui/money";
import { ExpenseId } from "@/shared-kernel/ids";
import { loadTrip } from "../../data";
import { DeleteExpenseButton } from "./delete-button";
import { SplitEditor } from "./split-editor";

const CATEGORY = { comida: "Comida", transporte: "Transporte", super: "Súper", tragos: "Tragos", alojamiento: "Alojamiento", planes: "Planes", otro: "Otro" } as const;
/** [someone else, you]: "Mateo cambió…" / "Tú cambiaste…". */
const HISTORY: Record<string, [string, string]> = {
  created: ["registró el gasto", "registraste el gasto"],
  drafted: ["subió el recibo", "subiste el recibo"],
  completed: ["completó el recibo", "completaste el recibo"],
  money_changed: ["cambió el monto o el reparto", "cambiaste el monto o el reparto"],
  details_changed: ["cambió los detalles", "cambiaste los detalles"],
  deleted: ["lo borró", "lo borraste"],
};
const when = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

export default async function DetalleGasto({ params }: { params: Promise<{ tripId: string; expenseId: string }> }) {
  const { tripId: raw, expenseId } = await params;
  const { c, principal, tripId, trip, nameOf } = await loadTrip(raw);
  const r = await c.ledger.getExpense(principal, tripId, ExpenseId(expenseId));
  if (!r.ok) notFound();
  const e = r.value;
  const base = `/t/${tripId}`;
  const cur = e.currency ?? trip.baseCurrency;
  const initials = (id: string) => (trip.seats.find((s) => s.id === id)?.displayName ?? "?").slice(0, 1);
  const people = trip.seats.filter((s) => s.status === "active" && !s.awaitingApproval).map((s) => ({ id: s.id as string, name: s.id === trip.mySeatId ? "Tú" : s.displayName }));
  const closed = trip.status === "closed";
  const editable = !closed && e.status === "complete" && e.amount !== null && cur === trip.baseCurrency;

  return (
    <main className="flex flex-col gap-6 px-5 pt-5 pb-36">
      <header className="flex min-h-11 items-center">
        <Link href={`${base}/gastos`} aria-label="Volver a Gastos" className="flex size-11 items-center justify-center rounded-full bg-tint">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      </header>

      <section className="flex flex-col gap-1.5 px-1">
        <span className="text-sm font-semibold text-muted">{CATEGORY[e.category]}</span>
        <h1 className="text-[26px] leading-tight font-bold tracking-tight">{expenseTitle(e)}</h1>
        <span className="tabular text-[44px] leading-tight font-bold tracking-tight">{e.amount !== null ? fmt(e.amount, cur) : "Sin monto"}</span>
        <span className="text-sm text-muted">
          {when.format(new Date(e.occurredAt))} · Agregado por {e.createdBy === trip.mySeatId ? "ti" : nameOf(e.createdBy)}
          {e.receiptCount > 0 && (
            <>
              {" · "}
              <a href={`${base}/soporte/${e.id}`} target="_blank" rel="noreferrer" className="font-semibold text-accent-text">
                Ver factura
              </a>
            </>
          )}
        </span>
      </section>

      {e.payers.length > 0 && (
        <section aria-label="Pagó" className="flex flex-col gap-2.5">
          <h2 className="px-1 text-sm font-semibold text-muted">Pagó</h2>
          <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
            {e.payers.map((p) => (
              <Row key={p.seatId} initial={initials(p.seatId)} name={nameOf(p.seatId)} amount={fmt(p.amount, cur)} />
            ))}
          </ul>
        </section>
      )}

      {e.shares.length > 0 && (
        <section aria-label="Le toca a" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold text-muted">Le toca a</h2>
            <span className="text-[13px] text-muted">{e.splitMethod === "exact" ? "Montos exactos" : "Partes iguales"}</span>
          </div>
          <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
            {e.shares.map((s) => (
              <Row
                key={s.seatId}
                initial={initials(s.seatId)}
                name={s.seatId === trip.mySeatId ? "Tu parte" : nameOf(s.seatId)}
                amount={fmt(s.amount, cur)}
                mine={s.seatId === trip.mySeatId}
              />
            ))}
          </ul>
        </section>
      )}

      {editable && (
        <SplitEditor
          tripId={tripId}
          expenseId={e.id}
          version={e.moneyVersion}
          currency={cur}
          total={e.amount!}
          canEditTotal={e.payers.length === 1}
          people={people}
          shares={e.shares.map((s) => ({ seatId: s.seatId as string, amount: s.amount }))}
          wasExact={e.splitMethod === "exact"}
        />
      )}
      {closed ? (
        <p className="px-1 text-sm text-muted">El viaje está cerrado: los gastos ya no se editan.</p>
      ) : (
        !editable &&
        e.status === "complete" && (
          <p className="px-1 text-sm text-muted">Este gasto está en otra moneda; aún no se puede editar el reparto aquí.</p>
        )
      )}

      {!closed && e.status !== "deleted" && <DeleteExpenseButton tripId={tripId} expenseId={e.id} />}

      <section aria-label="Historial" className="flex flex-col gap-2 px-1">
        <h2 className="text-sm font-semibold text-muted">Historial</h2>
        <ol className="flex flex-col gap-1.5 text-[14px]">
          {[...e.history].reverse().map((h, i) => (
            <li key={i}>
              <span className="font-semibold">{nameOf(h.by)}</span> {HISTORY[h.kind]?.[h.by === trip.mySeatId ? 1 : 0] ?? h.kind}
              <span className="text-muted"> · {when.format(new Date(h.at))}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Row(props: { initial: string; name: string; amount: string; mine?: boolean }) {
  return (
    <li className={`-mx-2 flex min-h-[58px] items-center gap-3 rounded-2xl px-2 ${props.mine ? "bg-accent-soft" : ""}`}>
      <span className={`flex size-9 items-center justify-center rounded-full text-[13px] font-semibold ${props.mine ? "bg-ink text-bg" : "bg-tint-2"}`}>
        {props.initial}
      </span>
      <span className={`flex-1 text-[15px] font-semibold ${props.mine ? "text-accent-text" : ""}`}>{props.name}</span>
      <span className={`tabular text-[15px] font-semibold ${props.mine ? "text-accent-text" : ""}`}>{props.amount}</span>
    </li>
  );
}
