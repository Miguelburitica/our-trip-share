import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import type { PushMessage, TripDirectory } from "../domain/messages";

/** A browser's Web Push subscription, for one signed-in person on one device. */
export interface PushSubscriptionRecord {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly principalId: PrincipalId;
}

export interface PushSubscriptionRepository {
  save(sub: PushSubscriptionRecord): Promise<void>;
  remove(endpoint: string): Promise<void>;
  listFor(principals: readonly PrincipalId[]): Promise<PushSubscriptionRecord[]>;
}

/** "gone": the browser dropped the subscription (uninstalled, permission revoked); forget it. */
export interface PushSender {
  send(sub: PushSubscriptionRecord, message: PushMessage): Promise<"sent" | "gone">;
}

/** Who is in a trip (trip-membership, through the composition root). */
export interface NotificationDirectory {
  trip(tripId: TripId): Promise<TripDirectory | null>;
}

/** What the evening digest needs from the ledger and settlement. */
export interface DigestSource {
  /** Trips with expenses recorded in [from, to), and how many. */
  activity(from: Date, to: Date): Promise<Array<{ tripId: TripId; expenses: number }>>;
  balances(tripId: TripId): Promise<ReadonlyMap<SeatId, number>>;
}
