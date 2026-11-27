import type { PrincipalId } from "@/shared-kernel/ids";
import type { PushSubscriptionRecord, PushSubscriptionRepository } from "../application/ports";

export class InMemoryPushSubscriptionRepository implements PushSubscriptionRepository {
  private subs = new Map<string, PushSubscriptionRecord>();

  async save(sub: PushSubscriptionRecord) {
    this.subs.set(sub.endpoint, sub);
  }
  async remove(endpoint: string) {
    this.subs.delete(endpoint);
  }
  async listFor(principals: readonly PrincipalId[]) {
    return [...this.subs.values()].filter((s) => principals.includes(s.principalId));
  }
}
