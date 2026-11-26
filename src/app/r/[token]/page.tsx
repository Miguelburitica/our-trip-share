import type { Metadata } from "next";
import { fmt } from "@/app/ui/money";
import { ui } from "@/app/ui/styles";
import { getContainer } from "@/composition/server";

/** Depends on the token, so it blocks on purpose. */
export const instant = false;

export const metadata: Metadata = { title: "Resumen del viaje · Our Share", robots: { index: false, follow: false } };

const PHASE = { active: "En curso", settling: "Liquidando", closed: "Cerrado" } as const;

/**
 * "Compartir resumen": read-only, no sign-in. Totals, what each person paid and used, and who pays
 * whom. No expense details, links or contact info.
 */
export default async function Resumen({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await getContainer();
  const summary = await c.settlement.publicSummary(token);
  const info = summary.ok ? await c.membership.publicTripInfo(summary.value.tripId) : null;
  if (!summary.ok || !info?.ok) {
    return (
      <main className={`${ui.page} gap-5 pt-24`}>
        <h1 className="text-3xl font-bold tracking-tight">Este resumen ya no está disponible</h1>
        <p className="text-[17px] text-muted">Pídele a quien organiza el viaje el enlace nuevo.</p>
      </main>
    );
  }
  const s = summary.value;
  const { name, startDate, endDate, names } = info.value;
  const who = (id: string) => names[id] ?? "Alguien";
  const cur = s.baseCurrency;

  return (
    <main className={`${ui.page} gap-7`}>
      <header className="flex flex-col gap-1 px-1">
        <p className="text-sm font-semibold text-muted">Resumen · {PHASE[s.phase]}</p>
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        {startDate && endDate && (
          <p className="text-[15px] text-muted">
            {startDate} → {endDate}
          </p>
        )}
      </header>

      <section aria-label="Total" className="flex flex-col gap-1.5 rounded-[28px] bg-tint px-6 py-6">
        <span className="text-[15px] font-medium text-muted">Gastaron entre todos</span>
        <span className="tabular text-5xl leading-none font-bold tracking-tight">{fmt(s.total, cur)}</span>
        {s.pot && (
          <span className="pt-1 text-sm text-ink-2">
            La vaca tiene {fmt(s.pot.cash, cur)} · la guarda {who(s.pot.holderSeatId)}
          </span>
        )}
      </section>

      <section aria-label="Quién le paga a quién" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-[15px] font-semibold">{s.plan.length ? "Quién le paga a quién" : "Todos están a paz y salvo"}</h2>
        {s.plan.length > 0 && (
          <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
            {s.plan.map((t) => (
              <li key={`${t.from}-${t.to}`} className="flex min-h-[54px] items-center justify-between gap-3">
                <span className="text-[15px] font-semibold">
                  {who(t.from)} → {who(t.to)}
                </span>
                <span className="tabular text-[15px] font-semibold">{fmt(t.amount, cur)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Por persona" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-[15px] font-semibold">Por persona</h2>
        <div className="overflow-hidden rounded-3xl bg-surface shadow-card">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="py-2.5 pl-4.5 font-semibold">Persona</th>
                <th className="py-2.5 text-right font-semibold">Pagó</th>
                <th className="py-2.5 text-right font-semibold">Le tocó</th>
                <th className="py-2.5 pr-4.5 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {[...s.people]
                .sort((a, b) => b.balance - a.balance)
                .map((p) => (
                  <tr key={p.seatId} className="border-t border-tint">
                    <td className="py-3 pl-4.5 font-semibold">{who(p.seatId)}</td>
                    <td className="tabular py-3 text-right">{fmt(p.paid, cur)}</td>
                    <td className="tabular py-3 text-right">{fmt(p.consumed, cur)}</td>
                    <td className={`tabular py-3 pr-4.5 text-right font-semibold ${p.balance < 0 ? "text-accent-text" : ""}`}>
                      {p.balance > 0 ? "+" : ""}
                      {fmt(p.balance, cur)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="px-1 text-[13px] text-muted">Saldo: positivo, le deben; negativo, debe. También cuenta lo que cada uno puso en la vaca y los pagos ya confirmados.</p>
      </section>

      <footer className="pt-2 text-center text-[13px] text-muted">Hecho con Our Share</footer>
    </main>
  );
}
