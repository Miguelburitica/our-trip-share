import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";
import { ui } from "@/app/ui/styles";
import { JoinButton } from "./join-button";

/** Depends on the token and the session, so it blocks on purpose. */
export const instant = false;

/** Personal link (spec 6.1): opens even in WhatsApp's in-app browser, no account needed. */
export default async function Unirse({ params }: { params: Promise<{ tripId: string; token: string }> }) {
  const { tripId, token } = await params;
  const principal = await currentPrincipal();
  const c = await getContainer();
  const preview = await c.membership.previewInvite(TripId(tripId), token, principal?.id ?? null);

  if (!preview.ok) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold tracking-tight">Este enlace ya no sirve</h1>
        <p className="text-[17px] text-muted">Pídele a quien organiza el viaje que te envíe uno nuevo.</p>
      </Shell>
    );
  }
  const p = preview.value;
  if (p.state === "mine") redirect(`/t/${p.tripId}`);

  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold text-accent-text">{p.tripName}</p>
        <h1 className="text-[40px] leading-[1.05] font-bold tracking-tight">Hola {p.seatName}</h1>
      </div>
      {p.state === "open" && (
        <>
          <p className="text-[17px] text-muted">
            {p.organizer} te agregó a <span className="font-semibold text-ink">{p.tripName}</span>. Aquí ves cuánto
            te toca y anotas lo que pagues. Son {p.people} personas.
          </p>
          <div className="mt-auto flex flex-col gap-4 pt-10">
            <JoinButton tripId={p.tripId} token={token} seatName={p.seatName} />
            <p className={`${ui.hint} text-center`}>Sin crear cuenta. Queda guardado en este teléfono.</p>
          </div>
        </>
      )}
      {p.state === "recover" && (
        <>
          <p className="text-[17px] text-muted">
            {p.organizer} te reenvió tu enlace de <span className="font-semibold text-ink">{p.tripName}</span>. Al entrar aquí, tu
            lugar pasa a este teléfono y el anterior deja de tener acceso.
          </p>
          <div className="mt-auto flex flex-col gap-4 pt-10">
            <JoinButton tripId={p.tripId} token={token} seatName={p.seatName} />
            <p className={`${ui.hint} text-center`}>Tus gastos y pagos siguen igual.</p>
          </div>
        </>
      )}
      {p.state === "taken" && (
        <p className="text-[17px] text-muted">
          Este lugar ya se abrió en otro teléfono. Si eres tú, pídele a {p.organizer} que te reenvíe el enlace.
        </p>
      )}
      {p.state === "member" && (
        <>
          <p className="text-[17px] text-muted">Ya estás en este viaje con otro nombre.</p>
          <Link href={`/t/${p.tripId}`} className={`${ui.primary} mt-auto`}>
            Ir al viaje
          </Link>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className={`${ui.page} gap-5 pt-24`}>{children}</main>;
}
