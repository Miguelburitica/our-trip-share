import type { SeatId } from "@/shared-kernel/ids";
import type { Expense } from "./expense";
import { defaultParticipants, type LedgerTripView } from "./trip-view";

/** How recent the last two expenses must be for their shared subgroup to become the default. */
export const SAME_AS_LAST_WINDOW_MS = 12 * 60 * 60_000;

export interface SplitSuggestion {
  /** Who quick add preselects. */
  participants: SeatId[];
  /** The last expense's participants, when they differ from the trip default ("Igual que el último"). */
  sameAsLast: SeatId[] | null;
  /** True when `participants` came from the last expenses rather than the trip default. */
  preselected: boolean;
}

const sameSet = (a: readonly SeatId[], b: readonly SeatId[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Quick-add split defaults (PRODUCT_SPEC §6.3): when the last two expenses, both recent, used the
 * same subgroup, preselect it; otherwise everyone active minus the default-excluded. The last
 * subgroup is always offered as a one-tap chip.
 */
export function suggestSplit(expenses: readonly Expense[], view: LedgerTripView, now: Date): SplitSuggestion {
  const defaults = defaultParticipants(view);
  const active = view.seats.filter((s) => s.active).map((s) => s.id);
  const recent = expenses
    .filter((e) => e.status === "complete" && e.type === "expense" && e.money)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  // In trip seat order, and only people still active.
  const participantsOf = (e: Expense) => active.filter((id) => e.money!.participantIds.includes(id));

  const last = recent[0] ? participantsOf(recent[0]) : [];
  const sameAsLast = last.length > 0 && !sameSet(last, defaults) ? last : null;
  const previous = recent[1];
  const preselected =
    sameAsLast !== null &&
    previous !== undefined &&
    now.getTime() - previous.occurredAt.getTime() <= SAME_AS_LAST_WINDOW_MS &&
    sameSet(participantsOf(previous), sameAsLast);

  return { participants: preselected ? sameAsLast : defaults, sameAsLast, preselected };
}
