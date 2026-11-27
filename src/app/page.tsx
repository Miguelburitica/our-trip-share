import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { currentPrincipal } from "@/composition/auth";
import { backend, getContainer, getDemoTripId } from "@/composition/server";
import { Logo } from "./ui/logo";
import { ui } from "./ui/styles";

/** Decides where to go from the session, so it blocks on purpose. */
export const instant = false;

/** The app opens straight into the last active trip (F3); without a session, a welcome. */
export default async function Home() {
  if (backend() === "memory") {
    await connection();
    redirect(`/t/${await getDemoTripId()}`);
  }
  const principal = await currentPrincipal();
  if (principal) {
    const trips = await (await getContainer()).membership.listMyTrips(principal.id);
    redirect(trips.ok && trips.value.length > 0 ? `/t/${trips.value[0].id}` : "/nuevo-viaje");
  }
  return (
    <main className={`${ui.page} justify-between`}>
      <div className="flex flex-1 flex-col justify-center gap-4 px-1">
        <Logo />
        <h1 className="text-[40px] leading-[1.05] font-bold tracking-tight">Las cuentas del viaje, claras para todos.</h1>
        <p className="text-[17px] text-muted">Cada quien anota lo que paga. Al final, la app dice quién le paga a quién.</p>
      </div>
      <div className="flex flex-col items-center gap-5">
        <Link href="/nuevo-viaje" className={ui.primary}>
          Crear un viaje
        </Link>
        <Link href="/entrar" className={ui.link}>
          Ya tengo cuenta · Entrar
        </Link>
      </div>
    </main>
  );
}
