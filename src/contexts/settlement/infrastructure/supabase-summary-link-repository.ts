import type { TripId } from "@/shared-kernel/ids";
import { type Db, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { SummaryLinkRepository } from "../application/ports";

export class SupabaseSummaryLinkRepository implements SummaryLinkRepository {
  constructor(private readonly db: Db) {}

  async get(tripId: TripId) {
    const rows = unwrapAll(await this.db.from("summary_links").select("token").eq("trip_id", tripId), "get summary link");
    return rows[0]?.token ?? null;
  }

  async tripOf(token: string) {
    const rows = unwrapAll(await this.db.from("summary_links").select("trip_id").eq("token", token), "find summary link");
    return (rows[0]?.trip_id as TripId | undefined) ?? null;
  }

  async set(tripId: TripId, token: string | null) {
    if (token) {
      unwrap(await this.db.from("summary_links").upsert({ trip_id: tripId, token, created_at: new Date().toISOString() }), "save summary link");
    } else {
      unwrap(await this.db.from("summary_links").delete().eq("trip_id", tripId), "delete summary link");
    }
  }
}
