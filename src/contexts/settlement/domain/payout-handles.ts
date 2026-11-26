import { validationError } from "@/shared-kernel/errors";
import type { SeatId } from "@/shared-kernel/ids";
import type { Transfer } from "./ledger-entry";

export const HANDLE_KINDS = ["breb", "nequi", "daviplata", "bank", "paypal", "otro"] as const;
export type HandleKind = (typeof HANDLE_KINDS)[number];
export const MAX_HANDLES = 4;

export interface PayoutHandle {
  readonly kind: HandleKind;
  readonly value: string;
}

/** Cleans what a person typed as "cómo me pagan": known kinds, trimmed, 1–80 chars, at most 4. */
export function normalizeHandles(input: ReadonlyArray<{ kind: string; value: string }>): PayoutHandle[] {
  const out: PayoutHandle[] = [];
  for (const h of input) {
    const value = String(h.value ?? "").trim().replace(/\s+/g, " ");
    if (!value) continue;
    if (!(HANDLE_KINDS as readonly string[]).includes(h.kind)) throw validationError("Tipo de cuenta desconocido");
    if (value.length > 80) throw validationError("Ese dato es demasiado largo");
    out.push({ kind: h.kind as HandleKind, value });
  }
  if (out.length > MAX_HANDLES) throw validationError(`Máximo ${MAX_HANDLES} formas de pago`);
  return out;
}

/**
 * Privacy (PRODUCT_SPEC §6.7): someone's payment details are shown only to members who currently
 * owe them in the plan. Returns the seats whose handles `viewer` may see.
 */
export function handlesVisibleTo(viewer: SeatId, plan: readonly Transfer[]): Set<SeatId> {
  return new Set(plan.filter((t) => t.from === viewer && t.amount > 0).map((t) => t.to));
}
