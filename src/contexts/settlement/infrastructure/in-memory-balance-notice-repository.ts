import type { NoticeId, SeatId, TripId } from "@/shared-kernel/ids";
import type { BalanceNoticeRepository } from "../application/ports";
import { BalanceNotice, type BalanceNoticeProps } from "../domain/balance-notice";

export class InMemoryBalanceNoticeRepository implements BalanceNoticeRepository {
  private rows = new Map<NoticeId, BalanceNoticeProps>();

  async add(notices: readonly BalanceNotice[]) {
    for (const n of notices) this.rows.set(n.id, structuredClone(n.toPrimitives()));
  }

  async get(id: NoticeId) {
    const row = this.rows.get(id);
    return row ? BalanceNotice.fromPrimitives(structuredClone(row)) : null;
  }

  async save(notice: BalanceNotice) {
    this.rows.set(notice.id, structuredClone(notice.toPrimitives()));
  }

  async listOpen(tripId: TripId, seatId: SeatId) {
    return [...this.rows.values()]
      .filter((r) => r.tripId === tripId && r.seatId === seatId && !r.dismissedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => BalanceNotice.fromPrimitives(structuredClone(r)));
  }
}
