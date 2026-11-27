import type { Clock } from "@/shared-kernel/clock";
import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import {
  changeToApprove,
  digestMessage,
  joinRequested,
  moneyChangeDeliveries,
  settlementToConfirm,
  settlingStarted,
  shareQuestion,
  type Delivery,
  type MoneyChange,
  type TripDirectory,
} from "../domain/messages";
import type { DigestSource, NotificationDirectory, PushSender, PushSubscriptionRecord, PushSubscriptionRepository } from "./ports";

export interface NotificationDeps {
  subscriptions: PushSubscriptionRepository;
  directory: NotificationDirectory;
  /** Absent when push isn't configured (no VAPID keys): nothing is sent. */
  sender: PushSender | null;
  digest: DigestSource;
  clock: Clock;
}

/**
 * Notifications never fail the action that caused them: every entry point swallows and logs
 * delivery errors. Callers run them after the response (`after`) where they can.
 */
export class NotificationUseCases {
  constructor(private readonly deps: NotificationDeps) {}

  get enabled() {
    return this.deps.sender !== null;
  }

  async subscribe(principalId: PrincipalId, sub: Omit<PushSubscriptionRecord, "principalId">) {
    if (!/^https:\/\//.test(sub.endpoint) || !sub.p256dh || !sub.auth) throw new Error("invalid push subscription");
    await this.deps.subscriptions.save({ ...sub, principalId });
  }

  async unsubscribe(endpoint: string) {
    await this.deps.subscriptions.remove(endpoint);
  }

  moneyChanged(tripId: TripId, change: MoneyChange) {
    return this.run(tripId, (dir) => moneyChangeDeliveries(dir, change));
  }

  settlementRecorded(tripId: TripId, s: { from: SeatId; to: SeatId; amount: number; pending: boolean; potHolder?: SeatId }) {
    if (!s.pending) return Promise.resolve(0);
    return this.run(tripId, (dir) => settlementToConfirm(dir, s.from, s.to, s.amount, s.potHolder));
  }

  joinRequested(tripId: TripId, name: string) {
    return this.run(tripId, (dir) => joinRequested(dir, name));
  }

  settlingStarted(tripId: TripId, by: PrincipalId) {
    return this.run(tripId, (dir) => {
      const seat = seatOf(dir, by);
      return seat ? settlingStarted(dir, seat) : [];
    });
  }

  shareQuestion(tripId: TripId, by: PrincipalId, note: string) {
    return this.run(tripId, (dir) => {
      const seat = seatOf(dir, by);
      return seat ? shareQuestion(dir, seat, note) : [];
    });
  }

  changeHeld(tripId: TripId, by: PrincipalId, what: string) {
    return this.run(tripId, (dir) => {
      const seat = seatOf(dir, by);
      return seat ? changeToApprove(dir, seat, what) : [];
    });
  }

  /**
   * The evening digest: for each trip with expenses recorded today (Bogotá), each linked member
   * with a subscription gets one line. Returns how many were sent.
   */
  async sendDigest(): Promise<number> {
    if (!this.deps.sender) return 0;
    const { from, to } = bogotaDay(this.deps.clock.now());
    let sent = 0;
    for (const { tripId, expenses } of await this.deps.digest.activity(from, to)) {
      const dir = await this.deps.directory.trip(tripId);
      if (!dir) continue;
      const balances = await this.deps.digest.balances(tripId);
      const deliveries: Delivery[] = dir.seats.flatMap((seat) =>
        seat.principalId ? [{ to: seat.principalId, message: digestMessage(dir, expenses, balances.get(seat.seatId) ?? 0) }] : [],
      );
      sent += await this.deliver(deliveries);
    }
    return sent;
  }

  private async run(tripId: TripId, pick: (dir: TripDirectory) => Delivery[]): Promise<number> {
    if (!this.deps.sender) return 0;
    try {
      const dir = await this.deps.directory.trip(tripId);
      return dir ? await this.deliver(pick(dir)) : 0;
    } catch (error) {
      console.error("notification failed", error);
      return 0;
    }
  }

  private async deliver(deliveries: readonly Delivery[]): Promise<number> {
    const sender = this.deps.sender;
    if (!sender || deliveries.length === 0) return 0;
    const subs = await this.deps.subscriptions.listFor([...new Set(deliveries.map((d) => d.to))]);
    let sent = 0;
    for (const d of deliveries) {
      for (const sub of subs.filter((s) => s.principalId === d.to)) {
        try {
          if ((await sender.send(sub, d.message)) === "gone") await this.deps.subscriptions.remove(sub.endpoint);
          else sent++;
        } catch (error) {
          console.error("push failed", error);
        }
      }
    }
    return sent;
  }
}

const seatOf = (dir: TripDirectory, principal: PrincipalId) => dir.seats.find((s) => s.principalId === principal)?.seatId ?? null;

/** Today in Bogotá (UTC−5, no DST) as a UTC range. */
export function bogotaDay(now: Date): { from: Date; to: Date } {
  const local = new Date(now.getTime() - 5 * 3_600_000);
  const from = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 5));
  return { from, to: new Date(from.getTime() + 86_400_000) };
}
