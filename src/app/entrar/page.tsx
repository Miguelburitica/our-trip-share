import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal } from "@/composition/auth";
import { backend } from "@/composition/server";
import { safeNext } from "@/app/ui/copy";
import { ui } from "@/app/ui/styles";
import { EmailCodeForm } from "./email-code-form";

/** Depends on the session (sign in vs. save a guest's access), so it blocks on purpose. */
export const instant = false;

/**
 * Without a session: sign in with an emailed code (other device, lost guest seat).
 * As a guest: "Guarda tu acceso" attaches an email to the same principal, keeping every seat.
 */
export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (backend() === "memory") redirect(next);
  const principal = await currentPrincipal();
  if (principal?.kind === "user") redirect(next);
  const guest = principal?.kind === "guest";

  return (
    <main className={ui.page}>
      <Link href={next} className={`${ui.link} mb-10 self-start`}>
        ← Volver
      </Link>
      <div className="mb-8 flex flex-col gap-2 px-1">
        <h1 className="text-3xl font-bold tracking-tight">{guest ? "Guarda tu acceso" : "Entrar"}</h1>
        <p className="text-[17px] text-muted">
          {guest
            ? "Así puedes abrir tus viajes desde otro teléfono o recuperarlos si cambias de celular."
            : "Te enviamos un código a tu correo. Sin contraseñas."}
        </p>
      </div>
      <EmailCodeForm next={next} cta={guest ? "Enviar código" : "Enviarme un código"} />
    </main>
  );
}
