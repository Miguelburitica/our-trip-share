import Link from "next/link";
import { requirePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { ui } from "@/app/ui/styles";

/** Reads the session, so it blocks on purpose. */
export const instant = false;

export default async function Viajes() {
  const principal = await requirePrincipal("/viajes");
  const trips = await (await getContainer()).membership.listMyTrips(principal.id);
  const list = trips.ok ? trips.value : [];
  return (
    <main className={`${ui.page} gap-7`}>
      <h1 className="px-1 text-3xl font-bold tracking-tight">Mis viajes</h1>
      {list.length > 0 && (
        <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
          {list.map((t) => (
            <li key={t.id}>
              <Link href={`/t/${t.id}`} className="flex min-h-[62px] items-center gap-3">
                <span className="flex flex-1 flex-col">
                  <span className="text-[16px] font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">
                    {t.seats.length} personas · {t.status === "active" ? "Activo" : t.status === "settling" ? "Liquidando" : "Cerrado"}
                  </span>
                </span>
                <span aria-hidden className="text-[20px] text-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/nuevo-viaje" className={ui.primary}>
        Nuevo viaje
      </Link>
    </main>
  );
}
