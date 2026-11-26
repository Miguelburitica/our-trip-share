import "server-only";
import { expenseTitle, fmt } from "@/app/ui/money";
import type { HeldChangeDTO } from "@/contexts/expense-ledger/application/use-cases";
import type { HeldItem } from "./held-changes";

const VERB = { created: ["agregó", "agregaste"], edited: ["cambió", "cambiaste"], deleted: ["borró", "borraste"] } as const;
const when = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

/** Held changes as the lines the approval list shows ("Juli agregó Taxi · $40.000"). */
export function heldItems(changes: readonly HeldChangeDTO[], mySeatId: string, nameOf: (id: string) => string): HeldItem[] {
  return changes.map((h) => {
    const mine = h.by === mySeatId;
    const what = expenseTitle({ title: h.title, category: h.category, status: "complete" });
    const amount = h.amount !== null && h.currency && h.kind !== "deleted" ? ` · ${fmt(h.amount, h.currency)}` : "";
    return {
      id: h.id,
      line: `${mine ? "Tú" : nameOf(h.by)} ${VERB[h.kind][mine ? 1 : 0]} ${what}${amount}`,
      when: when.format(new Date(h.at)),
      mine,
    };
  });
}
