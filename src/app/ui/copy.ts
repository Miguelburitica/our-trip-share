import type { DomainError } from "@/shared-kernel/errors";

/** Spanish copy for each stable domain error code (the domain's own message is used when it's specific). */
export const ERROR_COPY: Record<DomainError["code"], string> = {
  validation: "Revisa los datos",
  forbidden: "No tienes permiso para hacer esto",
  conflict: "Alguien cambió esto mientras tanto",
  not_found: "No lo encontramos",
  already_claimed: "Ese lugar ya fue reclamado",
  currency_locked: "La moneda ya no se puede cambiar",
  invalid_state: "Ahora no se puede hacer esto",
};

/** Only same-site paths survive as a "next" target. */
export const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
