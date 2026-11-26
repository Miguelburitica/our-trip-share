import Link from "next/link";
import { ui } from "@/app/ui/styles";

/** Also what someone sees on a trip they aren't (yet) a member of: no hint that it exists. */
export default function NotFound() {
  return (
    <main className={`${ui.page} gap-5 pt-24`}>
      <h1 className="text-3xl font-bold tracking-tight">No encontramos esto</h1>
      <p className="text-[17px] text-muted">
        Puede que el enlace esté mal, o que aún no te hayan aprobado en ese viaje. Si te invitaron, abre de nuevo el enlace que te enviaron.
      </p>
      <Link href="/" className={`${ui.primary} mt-auto`}>
        Ir al inicio
      </Link>
    </main>
  );
}
