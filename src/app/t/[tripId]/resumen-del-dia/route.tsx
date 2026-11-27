import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dayKey, fmt } from "@/app/ui/money";
import { currentPrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";
import { daySummary, type DaySummary } from "./day-summary";

/**
 * "Compartir el día": a 1080×1350 card for the WhatsApp group (PRODUCT_SPEC §6.9) with the day's
 * total, its biggest expenses and where each person stands. Members only; never cached.
 */
const regular = readFile(join(process.cwd(), "assets/fonts/figtree-latin-400-normal.woff"));
const bold = readFile(join(process.cwd(), "assets/fonts/figtree-latin-700-normal.woff"));
const logo = readFile(join(process.cwd(), "src/app/icon.svg")).then((svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`);

const longDay = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
const dayTitle = (day: string) => {
  const s = longDay.format(new Date(`${day}T12:00:00-05:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const C = { bg: "#f4f7fb", surface: "#ffffff", tint: "#e7eef7", ink: "#0e1f3a", muted: "#52637e", accent: "#1d5bd6", accentText: "#1946a8" };

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) return new Response("Unauthorized", { status: 401 });
  const { tripId } = await params;
  const asked = new URL(request.url).searchParams.get("dia");
  const day = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : dayKey(new Date().toISOString());

  const c = await getContainer();
  const [trip, expenses, balances] = await Promise.all([
    c.membership.getTrip(principal.id, TripId(tripId)),
    c.ledger.listTripExpenses(principal.id, TripId(tripId)),
    c.settlement.getTripBalances(principal.id, TripId(tripId)),
  ]);
  if (!trip.ok || !expenses.ok || !balances.ok) return new Response("Not found", { status: 404 });

  const names = new Map<string, string>(trip.value.seats.map((s) => [s.id, s.displayName]));
  if (trip.value.pot) names.set(trip.value.pot.seatId, "La vaca");
  const summary = daySummary(day, expenses.value, balances.value.balances, (id) => names.get(id) ?? "Alguien");

  return new ImageResponse(<Card trip={trip.value.name} currency={trip.value.baseCurrency} summary={summary} logo={await logo} />, {
    width: 1080,
    height: 1350,
    fonts: [
      { name: "Figtree", data: await regular, weight: 400, style: "normal" },
      { name: "Figtree", data: await bold, weight: 700, style: "normal" },
    ],
    headers: { "Cache-Control": "private, no-store" },
  });
}

function Card({ trip, currency, summary, logo }: { trip: string; currency: string; summary: DaySummary; logo: string }) {
  const money = (n: number) => fmt(n, currency);
  const count = summary.count === 1 ? "1 gasto" : `${summary.count} gastos`;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, color: C.ink, fontFamily: "Figtree", padding: 64, gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
        <img src={logo} width={52} height={52} alt="" />
        <span style={{ fontSize: 28, fontWeight: 700 }}>Our Share</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: -1.5 }}>{trip}</span>
        <span style={{ fontSize: 30, color: C.muted }}>{dayTitle(summary.day)}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", background: C.surface, borderRadius: 36, padding: "36px 40px", gap: 8 }}>
        <span style={{ fontSize: 28, color: C.muted }}>{summary.day === dayKey(new Date().toISOString()) ? "Hoy gastamos" : "Ese día gastamos"}</span>
        <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{money(summary.total)}</span>
        <span style={{ fontSize: 26, color: C.muted }}>
          {summary.count === 0 ? "Sin gastos este día" : count}
          {summary.pendingRate > 0 ? ` · ${summary.pendingRate} sin tasa todavía` : ""}
        </span>
        {summary.top.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 14 }}>
            {summary.top.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.tint, borderRadius: 22, padding: "16px 24px" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 30, fontWeight: 700 }}>{t.what}</span>
                  <span style={{ fontSize: 22, color: C.muted }}>Pagó {t.payer}</span>
                </div>
                <span style={{ fontSize: 30, fontWeight: 700 }}>{money(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, flexGrow: 1 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }}>Cómo vamos</span>
        {summary.people.map((p, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28 }}>
            <span>{p.name}</span>
            <span style={{ fontWeight: 700, color: p.balance < 0 ? C.accentText : p.balance > 0 ? C.ink : C.muted }}>
              {p.balance < 0 ? `debe ${money(-p.balance)}` : p.balance > 0 ? `le deben ${money(p.balance)}` : "a paz y salvo"}
            </span>
          </div>
        ))}
        {summary.more > 0 && <span style={{ fontSize: 24, color: C.muted }}>y {summary.more} más</span>}
      </div>

      <span style={{ fontSize: 22, color: C.muted }}>Cuentas claras con Our Share · our-trip-share.vercel.app</span>
    </div>
  );
}
