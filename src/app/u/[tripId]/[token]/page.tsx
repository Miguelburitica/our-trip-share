import { redirect } from "next/navigation";
import { currentPrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";
import { ui } from "@/app/ui/styles";
import { SeatPicker } from "./seat-picker";

/** Depends on the token and the session, so it blocks on purpose. */
export const instant = false;

/** Generic link / QR (PRODUCT_SPEC §6.1): pick your name, then wait for the organizer's OK. */
export default async function UnirseGrupo({ params }: { params: Promise<{ tripId: string; token: string }> }) {
  const { tripId, token } = await params;
  const principal = await currentPrincipal();
  const c = await getContainer();
  const preview = await c.membership.previewJoinLink(TripId(tripId), token, principal?.id ?? null);

  if (!preview.ok) {
    return (
      <main className={`${ui.page} gap-5 pt-24`}>
        <h1 className="text-3xl font-bold tracking-tight">Este enlace ya no sirve</h1>
        <p className="text-[17px] text-muted">Pídele a quien organiza el viaje el enlace nuevo.</p>
      </main>
    );
  }
  const p = preview.value;
  if (p.state === "member") redirect(`/t/${p.tripId}`);

  return (
    <main className={`${ui.page} gap-6 pt-24`}>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-accent-text">{p.tripName}</p>
        <h1 className="text-[40px] leading-[1.05] font-bold tracking-tight">{p.state === "pending" ? `Listo, ${p.pendingSeatName}` : "¿Quién eres?"}</h1>
      </div>
      {p.state === "pending" ? (
        <>
          <p className="text-[17px] text-muted">
            Le avisamos a {p.organizer}. Cuando te apruebe, abre este mismo enlace y entras al viaje.
          </p>
          <a href={`/u/${p.tripId}/${token}`} className={ui.secondary}>
            Ya me aprobaron
          </a>
          <details className="group mt-4">
            <summary className="cursor-pointer list-none text-center text-[15px] font-semibold text-accent-text">
              ¿Te equivocaste de nombre?
            </summary>
            <div className="pt-5">
              <SeatPicker tripId={p.tripId} token={token} seats={p.seats.filter((s) => s.firstName !== p.pendingSeatName?.split(" ")[0])} />
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="text-[17px] text-muted">
            {p.organizer} organiza <span className="font-semibold text-ink">{p.tripName}</span>. Elige tu nombre; {p.organizer} lo
            aprueba y entras sin crear cuenta.
          </p>
          <SeatPicker tripId={p.tripId} token={token} seats={p.seats} />
        </>
      )}
    </main>
  );
}
