import { notFound, redirect } from "next/navigation";
import { requirePrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { ExpenseId, TripId } from "@/shared-kernel/ids";

/** "Ver factura": checks membership, then sends the browser to a short-lived link to the photo. */
export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string; expenseId: string }> }) {
  const { tripId, expenseId } = await params;
  const { id: principal } = await requirePrincipal(`/t/${tripId}/gastos`);
  const c = await getContainer();
  const url = await c.ledger.receiptUrl(principal, TripId(tripId), ExpenseId(expenseId));
  if (!url.ok) notFound();
  // The in-memory demo serves data: URLs, which browsers won't open from a redirect.
  const data = /^data:([^;]+);base64,(.*)$/.exec(url.value);
  if (data) return new Response(Buffer.from(data[2], "base64"), { headers: { "content-type": data[1], "cache-control": "private, no-store" } });
  redirect(url.value);
}
