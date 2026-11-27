/**
 * Expenses saved on the phone while offline, and how they reach the server once there's signal.
 * Pure logic over two ports (the phone's store and the server), so it's testable without a browser.
 */

export interface PendingExpenseInput {
  amount: number;
  currency: string;
  cardCharge: number | null;
  category: string;
  title?: string;
  payerSeatId: string;
  participantIds: string[];
}

export interface PendingExpense {
  /** Also the expense id on the server: retrying never records it twice. */
  id: string;
  tripId: string;
  /** When it was recorded on the phone (ISO); becomes the expense's date. */
  createdAt: string;
  input: PendingExpenseInput;
  /** The receipt photo, until it's uploaded. */
  photo?: Blob | null;
  /** Set once the photo (taken online or uploaded on a later try) is stored on the server. */
  receiptPath?: string | null;
  /** What the list shows: "Peaje · $18.000 · pagó Leo". */
  label: string;
  /** "failed": the server said no (e.g. the trip was closed); it stays until the person discards it. */
  status: "waiting" | "failed";
  error?: string;
}

export interface PendingStore {
  list(): Promise<PendingExpense[]>;
  put(item: PendingExpense): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The server, as the sync sees it. A thrown error means "no connection": try again later. */
export interface SyncApi {
  upload(tripId: string, photo: Blob): Promise<{ ok: true; receiptPath: string } | { ok: false; message: string }>;
  record(item: PendingExpense): Promise<{ ok: true } | { ok: false; message: string }>;
}

export interface SyncReport {
  sent: number;
  failed: number;
  /** True when it stopped because the connection dropped again. */
  offline: boolean;
}

/** Sends waiting expenses oldest first. Stops at the first network error; nothing is lost. */
export async function flushPending(store: PendingStore, api: SyncApi): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, failed: 0, offline: false };
  const waiting = (await store.list()).filter((p) => p.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let item of waiting) {
    try {
      if (item.photo && !item.receiptPath) {
        const up = await api.upload(item.tripId, item.photo);
        if (!up.ok) {
          await store.put({ ...item, status: "failed", error: up.message });
          report.failed++;
          continue;
        }
        // Keep the path so a retry after a dropped connection doesn't upload the photo again.
        item = { ...item, photo: null, receiptPath: up.receiptPath };
        await store.put(item);
      }
      const saved = await api.record(item);
      if (saved.ok) {
        await store.remove(item.id);
        report.sent++;
      } else {
        await store.put({ ...item, status: "failed", error: saved.message });
        report.failed++;
      }
    } catch {
      report.offline = true;
      break;
    }
  }
  return report;
}
