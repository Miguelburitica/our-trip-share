import type { Db } from "@/platform/supabase/db";
import { unwrap, unwrapAll } from "@/platform/supabase/db";
import type { PrincipalId } from "@/shared-kernel/ids";
import type { PushSubscriptionRecord, PushSubscriptionRepository } from "../application/ports";

export class SupabasePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: Db) {}

  async save(sub: PushSubscriptionRecord) {
    unwrap(
      await this.db
        .from("push_subscriptions")
        .upsert({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, principal_id: sub.principalId }, { onConflict: "endpoint" }),
      "save push subscription",
    );
  }

  async remove(endpoint: string) {
    unwrap(await this.db.from("push_subscriptions").delete().eq("endpoint", endpoint), "remove push subscription");
  }

  async listFor(principals: readonly PrincipalId[]) {
    if (principals.length === 0) return [];
    const rows = unwrapAll(await this.db.from("push_subscriptions").select("*").in("principal_id", [...principals]), "list push subscriptions");
    return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, principalId: r.principal_id as PrincipalId }));
  }
}
