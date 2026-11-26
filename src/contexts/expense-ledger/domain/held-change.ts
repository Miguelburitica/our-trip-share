import type { ExpenseId, SeatId, TripId } from "@/shared-kernel/ids";
import type { ExpenseProps } from "./expense";

/**
 * R14 during Liquidando: a money change by a non-admin that would reopen someone's settled balance
 * doesn't count until an admin approves it. Until then it waits here, as the expense it would
 * leave behind. `baseVersion` is the money version it was made on (null for a new expense), so a
 * change made on a version that moved since is never applied.
 */
export interface HeldChange {
  readonly id: string;
  readonly tripId: TripId;
  readonly expenseId: ExpenseId;
  readonly kind: "created" | "edited" | "deleted";
  readonly proposed: ExpenseProps;
  readonly baseVersion: number | null;
  readonly by: SeatId;
  readonly at: Date;
}

/** JSON for storage: dates as ISO strings. */
export function expensePropsToJson(p: ExpenseProps): unknown {
  return JSON.parse(JSON.stringify(p));
}

export function expensePropsFromJson(raw: unknown): ExpenseProps {
  const p = raw as ExpenseProps & { occurredAt: string; createdAt: string; updatedAt: string };
  return {
    ...p,
    occurredAt: new Date(p.occurredAt),
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    history: p.history.map((h) => ({ ...h, at: new Date(h.at as unknown as string) })),
  };
}
