import Link from "next/link";
import { ui } from "@/app/ui/styles";
import { CreateTripForm } from "./create-trip-form";

/** Static: no session is needed until the form is sent (spec 6.2, ≤ 30 s). */
export default function NuevoViaje() {
  return (
    <main className={ui.page}>
      <Link href="/" className={`${ui.link} mb-10 self-start`}>
        ← Volver
      </Link>
      <h1 className="mb-8 px-1 text-3xl font-bold tracking-tight">Nuevo viaje</h1>
      <CreateTripForm />
    </main>
  );
}
