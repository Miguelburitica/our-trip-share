import Link from "next/link";
import { dayKey, dayLabel, expenseTitle, fmt } from "@/app/ui/money";
import { loadTrip } from "../data";

export default async function Gastos({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ ver?: string; borrado?: string }>;
}) {
  const [{ tripId: raw }, { ver, borrado }] = await Promise.all([params, searchParams]);
  const { c, principal, tripId, trip, nameOf } = await loadTrip(raw);
  const result = await c.ledger.listTripExpenses(principal, tripId);
  if (!result.ok) throw new Error("No pudimos cargar los gastos");
  const showAll = ver === "todos";
  const all = result.value;
  const visible = showAll ? all : all.filter((e) => e.status === "draft" || e.includesMe);
  const myTotal = all.reduce((acc, e) => acc + (e.status === "complete" && e.myShare ? e.myShare : 0), 0);
  const tripTotal = all.reduce((acc, e) => acc + (e.status === "complete" && e.baseAmount ? e.baseAmount * (e.type === "money_received" ? -1 : 1) : 0), 0);

  const groups = new Map<string, typeof visible>();
  for (const e of visible) {
    const k = dayKey(e.occurredAt);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const base = `/t/${tripId}/gastos`;

  return (
    <main className="flex flex-col gap-6 px-5 pt-14 pb-36">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-3xl font-bold tracking-tight">Gastos</h1>
        <p className="text-[15px] text-muted">
          Tu parte {fmt(myTotal, trip.baseCurrency)} de {fmt(tripTotal, trip.baseCurrency)}
        </p>
      </header>

      <nav aria-label="Mostrar" className="flex gap-2">
        <Link href={base} aria-current={!showAll ? "page" : undefined} className={`flex min-h-10 items-center rounded-full px-4.5 text-sm font-semibold ${!showAll ? "bg-ink text-bg" : "bg-tint"}`}>
          Donde estoy
        </Link>
        <Link href={`${base}?ver=todos`} aria-current={showAll ? "page" : undefined} className={`flex min-h-10 items-center rounded-full px-4.5 text-sm font-semibold ${showAll ? "bg-ink text-bg" : "bg-tint"}`}>
          Todos
        </Link>
      </nav>

      {borrado && (
        <p role="status" className="rounded-2xl bg-tint px-4 py-3 text-[15px] font-medium">
          Gasto borrado. Ya no cuenta en las cuentas de nadie.
        </p>
      )}

      {groups.size === 0 && <p className="px-1 text-muted">Aún no hay gastos. Toca + para agregar el primero.</p>}

      {[...groups.entries()].map(([day, items]) => (
        <section key={day} className="flex flex-col gap-2.5">
          <h2 className="px-1 text-sm font-semibold text-muted">{dayLabel(items[0].occurredAt)}</h2>
          <ul className="rounded-[22px] bg-surface px-4.5 py-1 shadow-card">
            {items.map((e) => (
              <li key={e.id} className="relative flex min-h-[62px] items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/t/${tripId}/gastos/${e.id}`} className="truncate text-[15px] font-semibold after:absolute after:inset-0">
                    {expenseTitle(e)}
                  </Link>
                  <span className="text-[13px] text-muted">
                    {nameOf(e.payers[0]?.seatId ?? e.createdBy)}
                    {e.currency && e.currency !== trip.baseCurrency && e.amount !== null && ` · ${fmt(e.amount, e.currency)}`}
                    {e.receiptCount > 0 && (
                      <>
                        {" · "}
                        <a href={`/t/${tripId}/soporte/${e.id}`} target="_blank" rel="noreferrer" className="relative z-10 font-semibold text-accent-text">
                          Ver factura
                        </a>
                      </>
                    )}
                  </span>
                </span>
                {e.status === "draft" ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-semibold text-accent-text">Sin monto</span>
                ) : e.ratePending ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-semibold text-accent-text">Tasa pendiente</span>
                ) : e.myShare !== null ? (
                  <span className="tabular text-[15px] font-semibold">{fmt(e.myShare, trip.baseCurrency)}</span>
                ) : (
                  <span className="text-sm text-muted">No estás</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
