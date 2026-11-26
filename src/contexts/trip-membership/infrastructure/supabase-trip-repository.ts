import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import type { CurrencyCode } from "@/shared-kernel/money/currency";
import { type Db, type Row, toDate, unwrap, unwrapAll } from "@/platform/supabase/db";
import type { TripRepository } from "../application/ports";
import type { SeatProps } from "../domain/seat";
import { Trip, type TripProps } from "../domain/trip";

type TripRow = Row<"trips"> & { seats: Row<"seats">[] };

const SELECT = "*, seats!seats_trip_id_fkey(*)";

function toSeat(r: Row<"seats">): SeatProps {
  return {
    id: r.id as SeatId,
    displayName: r.display_name,
    role: r.role,
    status: r.status,
    link:
      r.link_kind === "none" || r.principal_id === null
        ? { kind: "none" }
        : { kind: r.link_kind, principalId: r.principal_id as PrincipalId },
    pendingClaim:
      r.pending_principal_id && r.pending_kind && r.pending_kind !== "none" && r.pending_requested_at
        ? {
            principalId: r.pending_principal_id as PrincipalId,
            principalKind: r.pending_kind,
            requestedAt: toDate(r.pending_requested_at),
          }
        : null,
    defaultExcluded: r.default_excluded,
    inviteTokenHash: r.invite_token_hash,
    createdBy: r.created_by as SeatId | null,
  };
}

function toProps(r: TripRow): TripProps {
  return {
    id: r.id as TripId,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    baseCurrency: r.base_currency as CurrencyCode,
    status: r.status,
    settleMode: r.settle_mode,
    hubSeatId: r.hub_seat_id as SeatId | null,
    joinToken: r.join_token,
    createdAt: toDate(r.created_at),
    seats: [...r.seats].sort((a, b) => a.position - b.position).map(toSeat),
  };
}

function toRow(p: TripProps) {
  return {
    id: p.id,
    name: p.name,
    start_date: p.startDate,
    end_date: p.endDate,
    base_currency: p.baseCurrency,
    status: p.status,
    settle_mode: p.settleMode,
    hub_seat_id: p.hubSeatId,
    join_token: p.joinToken,
    created_at: p.createdAt.toISOString(),
    seats: p.seats.map((s, position) => ({
      id: s.id,
      display_name: s.displayName,
      role: s.role,
      status: s.status,
      link_kind: s.link.kind,
      principal_id: s.link.kind === "none" ? null : s.link.principalId,
      pending_principal_id: s.pendingClaim?.principalId ?? null,
      pending_kind: s.pendingClaim?.principalKind ?? null,
      pending_requested_at: s.pendingClaim?.requestedAt.toISOString() ?? null,
      default_excluded: s.defaultExcluded,
      invite_token_hash: s.inviteTokenHash,
      created_by: s.createdBy,
      position,
    })),
  };
}

/**
 * Trip aggregates in Postgres. Each loaded aggregate remembers the version it was read at, and
 * `save` is a compare-and-set on it (save_trip), so two people changing a trip at once can't
 * overwrite each other: the second write gets a conflict and the use case retries on fresh data.
 */
export class SupabaseTripRepository implements TripRepository {
  private versions = new WeakMap<Trip, number>();

  constructor(private readonly db: Db) {}

  private hydrate(row: TripRow): Trip {
    const trip = Trip.fromPrimitives(toProps(row));
    this.versions.set(trip, row.version);
    return trip;
  }

  async get(id: TripId) {
    const row = unwrap(await this.db.from("trips").select(SELECT).eq("id", id).maybeSingle(), "get trip");
    return row ? this.hydrate(row as TripRow) : null;
  }

  async save(trip: Trip) {
    const expected = this.versions.get(trip) ?? null;
    const next = unwrapAll(
      await this.db.rpc("save_trip", {
        p_trip: toRow(trip.toPrimitives()),
        p_expected_version: expected as number,
      }),
      "save trip",
    );
    this.versions.set(trip, next);
  }

  async listForPrincipal(principalId: PrincipalId) {
    const mine = unwrapAll(
      await this.db.from("seats").select("trip_id").eq("principal_id", principalId),
      "list my seats",
    );
    if (mine.length === 0) return [];
    const rows = unwrapAll(
      await this.db
        .from("trips")
        .select(SELECT)
        .in(
          "id",
          mine.map((s) => s.trip_id),
        )
        .order("created_at", { ascending: false }),
      "list trips",
    );
    return (rows as TripRow[]).map((r) => this.hydrate(r));
  }
}
