export interface SplitRow {
  seatId: string;
  included: boolean;
  /** Typed by hand ("lo que yo comí"); null means "the rest, split equally". */
  fixed: number | null;
}

/**
 * "Editar reparto": people with a typed amount keep it; everyone else included splits what's left
 * equally (the first ones absorb the leftover units). `remainder` > 0 means money still to assign,
 * < 0 means the typed amounts go over the total. Only remainder 0 can be saved.
 */
export function rebalance(total: number, rows: readonly SplitRow[]): { amounts: Map<string, number>; remainder: number } {
  const included = rows.filter((r) => r.included);
  const fixedSum = included.reduce((acc, r) => acc + (r.fixed ?? 0), 0);
  const free = included.filter((r) => r.fixed === null);
  const rest = total - fixedSum;
  const amounts = new Map<string, number>();
  for (const r of included) if (r.fixed !== null) amounts.set(r.seatId, r.fixed);
  if (free.length === 0 || rest < 0) {
    for (const r of free) amounts.set(r.seatId, 0);
    return { amounts, remainder: rest };
  }
  const base = Math.floor(rest / free.length);
  const extra = rest % free.length;
  free.forEach((r, i) => amounts.set(r.seatId, base + (i < extra ? 1 : 0)));
  return { amounts, remainder: 0 };
}
