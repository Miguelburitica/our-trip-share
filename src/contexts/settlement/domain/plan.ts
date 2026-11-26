import { validationError } from "@/shared-kernel/errors";
import type { SeatId } from "@/shared-kernel/ids";
import { allocate } from "@/shared-kernel/money/allocate";
import type { Balances } from "./balances";
import type { LedgerEntry, SettlementLike, Transfer } from "./ledger-entry";

const byAmountThenId = (a: [SeatId, number], b: [SeatId, number]) =>
  b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;

/**
 * Simplificado: repeatedly match the largest debtor with the largest creditor.
 * Deterministic (ties by seat id), at most n−1 transfers. `dust` ignores tiny leftovers.
 */
export function planSimplified(balances: Balances, dust = 0): Transfer[] {
  const creditors = [...balances].filter(([, v]) => v > dust).map(([k, v]) => [k, v] as [SeatId, number]);
  const debtors = [...balances].filter(([, v]) => v < -dust).map(([k, v]) => [k, -v] as [SeatId, number]);
  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c[1], d[1]);
    transfers.push({ from: d[0], to: c[0], amount });
    c[1] -= amount;
    d[1] -= amount;
    if (c[1] <= dust) creditors.shift();
    if (d[1] <= dust) debtors.shift();
  }
  return transfers;
}

/** Vía organizador: everyone settles with the hub. */
export function planHub(balances: Balances, hub: SeatId, dust = 0): Transfer[] {
  if (!balances.has(hub)) throw validationError("El organizador no está en el viaje");
  const transfers: Transfer[] = [];
  const sorted = [...balances].sort(byAmountThenId);
  for (const [seat, v] of [...sorted].reverse()) {
    if (seat !== hub && v < -dust) transfers.push({ from: seat, to: hub, amount: -v });
  }
  for (const [seat, v] of sorted) {
    if (seat !== hub && v > dust) transfers.push({ from: hub, to: seat, amount: v });
  }
  return transfers;
}

/**
 * Directo: who owes whom from the expenses they actually shared.
 * Each share is owed to the payers in proportion to what they paid. Confirmed
 * settlements between a pair reduce that pair's debt.
 */
export function planDirect(entries: readonly LedgerEntry[], settlements: readonly SettlementLike[] = []): Transfer[] {
  const owed = new Map<string, number>(); // key "debtor|creditor"
  const add = (from: SeatId, to: SeatId, amount: number) => {
    if (from === to || amount === 0) return;
    const key = `${from}|${to}`;
    owed.set(key, (owed.get(key) ?? 0) + amount);
  };
  for (const entry of entries) {
    const payerWeights = entry.payers.map((p) => p.base);
    for (const share of entry.shares) {
      const parts =
        entry.payers.length === 1
          ? [share.base]
          : allocate(share.base, payerWeights, entry.payers.map((p) => `${entry.expenseId}:${share.seatId}:${p.seatId}`));
      entry.payers.forEach((payer, i) => {
        if (entry.sign === 1) add(share.seatId, payer.seatId, parts[i]);
        else add(payer.seatId, share.seatId, parts[i]);
      });
    }
  }
  for (const s of settlements) {
    if (s.status === "confirmed") add(s.to, s.from, s.baseAmount);
  }

  const transfers: Transfer[] = [];
  const done = new Set<string>();
  for (const [key, amount] of owed) {
    const [a, b] = key.split("|") as [SeatId, SeatId];
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (done.has(pair)) continue;
    done.add(pair);
    const net = amount - (owed.get(`${b}|${a}`) ?? 0);
    if (net > 0) transfers.push({ from: a, to: b, amount: net });
    else if (net < 0) transfers.push({ from: b, to: a, amount: -net });
  }
  return transfers.sort((x, y) => y.amount - x.amount || (x.from < y.from ? -1 : 1));
}

/** What entering Liquidando froze (R9): the plan and the ledger-only balances at that moment. */
export interface PlanSnapshot {
  readonly frozenAt: Date;
  readonly transfers: readonly Transfer[];
  readonly ledgerBalances: Balances;
}

/** A row of the plan while Liquidando; `adjusted` when later changes moved it off the frozen plan. */
export interface SettlingTransfer extends Transfer {
  readonly adjusted: boolean;
}

/**
 * Plan while Liquidando: the frozen transfers stay as they were, minus confirmed payments made
 * since freezing, and whatever else moved the balances since then (a new expense, a payment that
 * didn't match a frozen row, a reversal) becomes delta transfers for the people it affects.
 *
 * `balances` are the current balances (ledger plus confirmed settlements). The deltas are the
 * simplified plan of what would remain after paying the rest of the frozen transfers, so paying
 * every row always leaves everyone at zero.
 */
export function buildSettlingPlan(input: {
  frozen: readonly Transfer[];
  balances: Balances;
  confirmedSinceFreeze: readonly SettlementLike[];
  dust?: number;
}): { frozen: Transfer[]; deltas: Transfer[] } {
  const paid = new Map<string, number>();
  for (const s of input.confirmedSinceFreeze) {
    if (s.status !== "confirmed") continue;
    const key = `${s.from}|${s.to}`;
    paid.set(key, (paid.get(key) ?? 0) + s.baseAmount);
  }
  const frozen = input.frozen
    .map((t) => {
      const key = `${t.from}|${t.to}`;
      const covered = Math.min(paid.get(key) ?? 0, t.amount);
      paid.set(key, (paid.get(key) ?? 0) - covered);
      return { ...t, amount: t.amount - covered };
    })
    .filter((t) => t.amount > 0);
  const residual: Balances = new Map(input.balances);
  for (const t of frozen) {
    residual.set(t.from, (residual.get(t.from) ?? 0) + t.amount);
    residual.set(t.to, (residual.get(t.to) ?? 0) - t.amount);
  }
  return { frozen, deltas: planSimplified(residual, input.dust ?? 0) };
}

/**
 * One row per pair for display: a delta on a frozen pair is added to it, a delta the other way
 * nets against it. Rows a delta touched are marked `adjusted`.
 */
export function mergeSettlingPlan(plan: { frozen: readonly Transfer[]; deltas: readonly Transfer[] }): SettlingTransfer[] {
  const rows: Array<{ from: SeatId; to: SeatId; amount: number; adjusted: boolean }> = plan.frozen.map((t) => ({
    ...t,
    adjusted: false,
  }));
  for (const d of plan.deltas) {
    const same = rows.find((r) => r.from === d.from && r.to === d.to);
    const opposite = rows.find((r) => r.from === d.to && r.to === d.from);
    if (same) {
      same.amount += d.amount;
      same.adjusted = true;
    } else if (opposite) {
      opposite.amount -= d.amount;
      opposite.adjusted = true;
      if (opposite.amount < 0) {
        Object.assign(opposite, { from: opposite.to, to: opposite.from, amount: -opposite.amount });
      }
    } else {
      rows.push({ ...d, adjusted: true });
    }
  }
  return rows.filter((r) => r.amount > 0);
}
