import type { Clock } from "@/shared-kernel/clock";
import { DomainError, notFound } from "@/shared-kernel/errors";
import { SeatId, TripId, type IdGenerator, type PrincipalId } from "@/shared-kernel/ids";
import { attempt, type Result } from "@/shared-kernel/result";
import { Trip, type Principal, type SettleMode } from "../domain/trip";
import type { SeatUsage, SettlementPresence, TokenService, TripRepository } from "./ports";

export interface TripMembershipDeps {
  trips: TripRepository;
  seatUsage: SeatUsage;
  settlements: SettlementPresence;
  tokens: TokenService;
  ids: IdGenerator;
  clock: Clock;
}

export interface SeatDTO {
  id: SeatId;
  displayName: string;
  role: "owner" | "admin" | "member";
  status: "active" | "left";
  linked: boolean;
  linkKind: "none" | "guest" | "user";
  pendingClaim: boolean;
  defaultExcluded: boolean;
}

export interface TripDTO {
  id: TripId;
  name: string;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
  status: "active" | "settling" | "closed";
  settleMode: SettleMode;
  hubSeatId: SeatId | null;
  seats: SeatDTO[];
  /** The caller's own seat. */
  mySeatId: SeatId;
}

export function toTripDTO(trip: Trip, mySeatId: SeatId): TripDTO {
  return {
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    baseCurrency: trip.baseCurrency,
    status: trip.status,
    settleMode: trip.settleMode,
    hubSeatId: trip.hubSeatId,
    mySeatId,
    seats: trip.allSeats.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      role: s.role,
      status: s.status,
      linked: s.isLinked,
      linkKind: s.link.kind,
      pendingClaim: s.pendingClaim !== null,
      defaultExcluded: s.defaultExcluded,
    })),
  };
}

export interface InvitePreviewDTO {
  tripId: TripId;
  tripName: string;
  seatName: string;
  organizer: string;
  people: number;
  /** open: can claim · mine: already yours · taken: someone else has it · member: you have another seat here */
  state: "open" | "mine" | "taken" | "member";
}

/** Application service for the trip-membership context. */
export class TripMembershipUseCases {
  constructor(private readonly deps: TripMembershipDeps) {}

  private async load(tripId: TripId): Promise<Trip> {
    const trip = await this.deps.trips.get(tripId);
    if (!trip) throw notFound("No encontramos ese viaje");
    return trip;
  }

  /**
   * Load, change, save. If someone else wrote the trip in between (conflict), start over on
   * fresh data: the domain re-checks every rule, so a lost race ends in the right error.
   */
  private async change<T>(tripId: TripId, fn: (trip: Trip) => T | Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const trip = await this.load(tripId);
      const out = await fn(trip);
      try {
        await this.deps.trips.save(trip);
        return out;
      } catch (e) {
        if (attempt >= 3 || !(e instanceof DomainError && e.code === "conflict")) throw e;
      }
    }
  }

  createTrip(input: {
    principal: Principal;
    displayName: string;
    name: string;
    baseCurrency: string;
    startDate?: string | null;
    endDate?: string | null;
    people?: string[];
  }): Promise<Result<TripDTO>> {
    return attempt(async () => {
      const trip = Trip.create({
        id: TripId(this.deps.ids.next()),
        name: input.name,
        baseCurrency: input.baseCurrency,
        startDate: input.startDate,
        endDate: input.endDate,
        creator: { ...input.principal, displayName: input.displayName },
        people: input.people,
        newSeatId: () => SeatId(this.deps.ids.next()),
        now: this.deps.clock.now(),
      });
      await this.deps.trips.save(trip);
      return toTripDTO(trip, trip.owner.id);
    });
  }

  getTrip(principalId: PrincipalId, tripId: TripId): Promise<Result<TripDTO>> {
    return attempt(async () => {
      const trip = await this.load(tripId);
      return toTripDTO(trip, trip.actor(principalId).id);
    });
  }

  listMyTrips(principalId: PrincipalId): Promise<Result<TripDTO[]>> {
    return attempt(async () => {
      const trips = await this.deps.trips.listForPrincipal(principalId);
      return trips.map((t) => toTripDTO(t, t.actor(principalId).id));
    });
  }

  /** Returns the raw token once so it can be shared (only its hash is stored). */
  issueInvite(principalId: PrincipalId, tripId: TripId, seatId: SeatId): Promise<Result<{ token: string }>> {
    return attempt(async () => {
      return this.change(tripId, (trip) => {
        const { token, hash } = this.deps.tokens.issue();
        trip.issueInvite(trip.actor(principalId).id, seatId, hash);
        return { token };
      });
    });
  }

  claimWithInvite(tripId: TripId, token: string, principal: Principal): Promise<Result<TripDTO>> {
    return attempt(async () => {
      return this.change(tripId, (trip) => {
        const seat = trip.claimWithInvite(this.deps.tokens.hash(token), principal);
        return toTripDTO(trip, seat.id);
      });
    });
  }

  /**
   * What a personal link shows before anyone signs in: "Hola Juli". Reveals only the trip name,
   * the seat's name and who organizes it, and only to someone holding the token.
   */
  previewInvite(
    tripId: TripId,
    token: string,
    viewer: PrincipalId | null,
  ): Promise<Result<InvitePreviewDTO>> {
    return attempt(async () => {
      const trip = await this.load(tripId);
      const seat = trip.seatForInvite(this.deps.tokens.hash(token));
      const mine = viewer !== null && seat.principalId === viewer;
      return {
        tripId: trip.id,
        tripName: trip.name,
        seatName: seat.displayName,
        organizer: trip.owner.displayName,
        people: trip.allSeats.filter((s) => s.isActive).length,
        state: mine ? "mine" : seat.isLinked ? "taken" : viewer !== null && trip.seatOf(viewer) ? "member" : "open",
      };
    });
  }

  /** A guest linked an email: their seats become account seats on every trip. */
  guestSavedAccess(principalId: PrincipalId): Promise<Result<void>> {
    return attempt(async () => {
      for (const t of await this.deps.trips.listForPrincipal(principalId)) {
        await this.change(t.id, (trip) => trip.upgradeGuest(principalId));
      }
    });
  }

  requestClaim(tripId: TripId, seatId: SeatId, principal: Principal): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.requestClaim(seatId, principal, this.deps.clock.now()));
    });
  }

  approveClaim(principalId: PrincipalId, tripId: TripId, seatId: SeatId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.approveClaim(trip.actor(principalId).id, seatId));
    });
  }

  addSeat(principalId: PrincipalId, tripId: TripId, displayName: string): Promise<Result<TripDTO>> {
    return attempt(async () => {
      return this.change(tripId, (trip) => {
        const actor = trip.actor(principalId);
        trip.addSeat(actor.id, displayName, SeatId(this.deps.ids.next()));
        return toTripDTO(trip, actor.id);
      });
    });
  }

  removeSeat(principalId: PrincipalId, tripId: TripId, seatId: SeatId): Promise<Result<void>> {
    return attempt(async () => {
      const used = await this.deps.seatUsage.isSeatUsed(tripId, seatId);
      await this.change(tripId, (trip) => trip.removeSeat(trip.actor(principalId).id, seatId, used));
    });
  }

  startSettling(principalId: PrincipalId, tripId: TripId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.startSettling(trip.actor(principalId).id));
    });
  }

  changeSettleMode(
    principalId: PrincipalId,
    tripId: TripId,
    mode: SettleMode,
    hubSeatId: SeatId | null,
  ): Promise<Result<void>> {
    return attempt(async () => {
      const has = await this.deps.settlements.hasSettlements(tripId);
      await this.change(tripId, (trip) => trip.changeSettleMode(trip.actor(principalId).id, mode, hubSeatId, has));
    });
  }

  changeBaseCurrency(principalId: PrincipalId, tripId: TripId, code: string): Promise<Result<void>> {
    return attempt(async () => {
      const has = await this.deps.settlements.hasSettlements(tripId);
      await this.change(tripId, (trip) => trip.changeBaseCurrency(trip.actor(principalId).id, code, has));
    });
  }
}
