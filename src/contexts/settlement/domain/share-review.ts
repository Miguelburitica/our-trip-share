import { validationError } from "@/shared-kernel/errors";
import type { SeatId, TripId } from "@/shared-kernel/ids";

/** "Revisa tu parte" (PRODUCT_SPEC §6.6): each person's answer once the trip is Liquidando. */
export type ShareReviewStatus = "ok" | "question";
export const MAX_QUESTION = 280;

export interface ShareReview {
  readonly tripId: TripId;
  readonly seatId: SeatId;
  readonly status: ShareReviewStatus;
  /** What they asked; only for "question". Private to them and the trip's admins. */
  readonly note: string | null;
  readonly updatedAt: Date;
}

export function reviewShare(
  input: { tripId: TripId; seatId: SeatId; status: string; note?: string | null },
  now: Date,
): ShareReview {
  if (input.status !== "ok" && input.status !== "question") throw validationError("Respuesta desconocida");
  const note = input.status === "question" ? (input.note ?? "").trim().replace(/\s+/g, " ") : null;
  if (input.status === "question") {
    if (!note) throw validationError("Escribe tu pregunta");
    if (note.length > MAX_QUESTION) throw validationError(`Máximo ${MAX_QUESTION} caracteres`);
  }
  return { tripId: input.tripId, seatId: input.seatId, status: input.status, note, updatedAt: now };
}
