import Link from "next/link";
import QRCode from "qrcode";
import { requestOrigin } from "@/app/ui/origin";
import { backend } from "@/composition/server";
import { loadTrip } from "../data";
import { signOutAction } from "../actions";
import { ClaimRequests } from "./claim-requests";
import { HandlesForm } from "./handles-form";
import { InviteButton } from "./invite-button";
import { JoinLinkCard } from "./join-link-card";
import { PotCard } from "./pot-card";

const when = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

const ROLE = { owner: "Organizador", admin: "Admin", member: "" } as const;

export default async function Viaje({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ nuevo?: string }>;
}) {
  const { tripId: raw } = await params;
  const { nuevo } = await searchParams;
  const { c, principal, trip, isGuest } = await loadTrip(raw);
  const myHandles = await c.settlement.getMyHandles(principal, trip.id);
  const me = trip.seats.find((s) => s.id === trip.mySeatId);
  const canInvite = me?.role === "owner" || me?.role === "admin";
  const waiting = trip.seats.filter((s) => !s.linked && !s.pendingClaim).length;
  const real = backend() === "supabase";
  const requests = trip.seats
    .filter((s) => s.pendingClaim && (canInvite || s.createdBy === trip.mySeatId))
    .map((s) => ({ seatId: s.id as string, name: s.displayName, isNew: s.createdBy === null, since: when.format(new Date(s.pendingSince!)) }));
  const joinUrl = real && trip.joinToken ? `${await requestOrigin()}/u/${trip.id}/${trip.joinToken}` : null;
  const qrSvg = joinUrl
    ? await QRCode.toString(joinUrl, { type: "svg", margin: 1, color: { dark: "#2B2420", light: "#00000000" } })
    : null;

  return (
    <main className="flex flex-col gap-7 px-5 pt-14 pb-36">
      <header className="flex flex-col gap-1 px-1">
        <h1 className="text-3xl font-bold tracking-tight">{trip.name}</h1>
        <p className="text-[15px] text-muted">
          {trip.startDate && trip.endDate ? `${trip.startDate} → ${trip.endDate} · ` : ""}
          {trip.baseCurrency}
        </p>
      </header>

      {nuevo && canInvite && waiting > 0 && (
        <section className="flex flex-col gap-1 rounded-[28px] bg-tint px-5 py-5">
          <p className="text-[17px] font-semibold">Listo. Ahora invita a cada uno</p>
          <p className="text-[15px] text-ink-2">
            Envía a cada persona su enlace por WhatsApp, o comparte el enlace del viaje en el grupo. Entran sin crear cuenta.
          </p>
        </section>
      )}

      {real && isGuest && (
        <Link href={`/entrar?next=/t/${trip.id}/viaje`} className="flex items-center gap-3 rounded-[22px] bg-surface p-4.5 shadow-card">
          <span className="flex flex-1 flex-col">
            <span className="text-[15px] font-semibold">Guarda tu acceso</span>
            <span className="text-[13px] text-muted">Con tu correo, para no perder el viaje si cambias de teléfono</span>
          </span>
          <span aria-hidden className="text-[20px] text-muted">›</span>
        </Link>
      )}

      {real && requests.length > 0 && <ClaimRequests tripId={trip.id} requests={requests} />}

      {real && <JoinLinkCard tripId={trip.id} tripName={trip.name} url={joinUrl} qrSvg={qrSvg} canManage={canInvite} />}

      <section aria-label="Personas" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-[15px] font-semibold">Personas · {trip.seats.filter((s) => !s.awaitingApproval).length}</h2>
        <ul className="rounded-3xl bg-surface px-4.5 py-1 shadow-card">
          {trip.seats.filter((s) => !s.awaitingApproval).map((s) => (
            <li key={s.id} className="flex min-h-[58px] items-center gap-3">
              <span
                className={`flex size-9 flex-none items-center justify-center rounded-full text-[13px] font-semibold ${
                  s.id === trip.mySeatId ? "bg-ink text-bg" : s.linked ? "bg-tint-2" : "border-[1.5px] border-dashed border-dashed text-muted"
                }`}
              >
                {s.displayName.slice(0, 1)}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="text-[15px] font-semibold">
                  {s.displayName}
                  {s.id === trip.mySeatId && " (tú)"}
                </span>
                <span className="text-[13px] text-muted">
                  {[ROLE[s.role], s.linked ? (s.linkKind === "guest" ? "Invitado" : "") : s.pendingClaim ? "Pidió entrar" : "Aún no entra"].filter(Boolean).join(" · ")}
                </span>
              </span>
              {real && canInvite && s.role !== "owner" && s.id !== trip.mySeatId && (
                <InviteButton tripId={trip.id} seatId={s.id} recover={s.linked} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <HandlesForm tripId={trip.id} initial={myHandles.ok ? myHandles.value : []} />

      <PotCard
        tripId={trip.id}
        pot={trip.pot ? { holderSeatId: trip.pot.holderSeatId } : null}
        people={trip.seats
          .filter((s) => s.status === "active" && !s.awaitingApproval)
          .map((s) => ({ id: s.id as string, name: s.id === trip.mySeatId ? `${s.displayName} (tú)` : s.displayName }))}
        canManage={canInvite && trip.status !== "closed"}
        mySeatId={trip.mySeatId}
      />

      <section aria-label="Herramientas" className="flex flex-col gap-2.5">
        <h2 className="px-1 text-[15px] font-semibold">Herramientas</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-[22px] bg-surface p-4.5 shadow-card">
            <p className="text-[15px] font-semibold">Gastos</p>
            <p className="text-[13px] text-muted">Activa</p>
          </div>
          {["Fotos", "Itinerario"].map((t) => (
            <div key={t} className="rounded-[22px] bg-tint p-4.5">
              <p className="text-[15px] font-semibold text-ink-2">{t}</p>
              <p className="text-[13px] text-muted">Próximamente</p>
            </div>
          ))}
        </div>
      </section>

      {real && (
        <nav className="flex flex-col items-center gap-4 pt-2">
          <Link href="/viajes" className="text-[15px] font-semibold text-accent-text">
            Mis viajes
          </Link>
          {!isGuest && (
            <form action={signOutAction}>
              <button type="submit" className="text-[15px] text-muted">
                Cerrar sesión
              </button>
            </form>
          )}
        </nav>
      )}
    </main>
  );
}
