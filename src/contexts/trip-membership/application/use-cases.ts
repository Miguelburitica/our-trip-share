import type { Clock } from "@/shared-kernel/clock";
import { DomainError, notFound } from "@/shared-kernel/errors";
import { SeatId, TripId, type IdGenerator, type PrincipalId } from "@/shared-kernel/ids";
import { attempt, type Result } from "@/shared-kernel/result";
import { Trip, type Principal, type SettleMode } from "../domain/trip";
import type { CloseChecks, SeatUsage, SettlementPresence, TokenService, TripRepository } from "./ports";

export interface TripMembershipDeps {
  trips: TripRepository;
  seatUsage: SeatUsage;
  settlements: SettlementPresence;
  closeChecks: CloseChecks;
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
  pendingSince: string | null;
  defaultExcluded: boolean;
  createdBy: SeatId | null;
  /** "No estoy en la lista" request not approved yet: hide it from splits and lists. */
  awaitingApproval: boolean;
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
  /** The generic link token, for members to share (QR, group chat). */
  joinToken: string | null;
  seats: SeatDTO[];
  /** The caller's own seat. */
  mySeatId: SeatId;
  /** La vaca: its seat (pays, takes contributions) and who keeps the money. Not in `seats`. */
  pot: { seatId: SeatId; holderSeatId: SeatId } | null;
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
    joinToken: trip.joinToken,
    mySeatId,
    pot: trip.pot ? { seatId: trip.pot.id, holderSeatId: trip.pot.holderSeatId! } : null,
    seats: trip.allSeats.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      role: s.role,
      status: s.status,
      linked: s.isLinked,
      linkKind: s.link.kind,
      pendingClaim: s.pendingClaim !== null,
      pendingSince: s.pendingClaim?.requestedAt.toISOString() ?? null,
      createdBy: s.createdBy,
      awaitingApproval: s.awaitingApproval,
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
  /**
   * open: can claim · recover: re-sent for a new phone, opening it moves the seat here ·
   * mine: already yours · taken: link already used by someone else · member: you have another seat here
   */
  state: "open" | "recover" | "mine" | "taken" | "member";
}

export interface JoinPreviewDTO {
  tripId: TripId;
  tripName: string;
  organizer: string;
  /** Unclaimed seats, first names only (PRODUCT_SPEC §6.1). `waiting`: someone else already asked for it. */
  seats: Array<{ id: SeatId; firstName: string; waiting: boolean }>;
  /** open: pick a seat · pending: you asked, waiting for approval · member: you're already in */
  state: "open" | "pending" | "member";
  pendingSeatName: string | null;
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
      return {
        tripId: trip.id,
        tripName: trip.name,
        seatName: seat.displayName,
        organizer: trip.owner.displayName,
        people: trip.allSeats.filter((s) => s.isActive).length,
        state: trip.inviteState(this.deps.tokens.hash(token), viewer),
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

  /** Creates or rotates the trip's generic link (QR); the old QR stops working. */
  issueJoinLink(principalId: PrincipalId, tripId: TripId): Promise<Result<{ token: string }>> {
    return attempt(async () =>
      this.change(tripId, (trip) => {
        const { token } = this.deps.tokens.issue();
        trip.issueJoinLink(trip.actor(principalId).id, token);
        return { token };
      }),
    );
  }

  /** What the generic link shows: the trip, who organizes it and the unclaimed first names. */
  previewJoinLink(tripId: TripId, token: string, viewer: PrincipalId | null): Promise<Result<JoinPreviewDTO>> {
    return attempt(async () => {
      const trip = await this.load(tripId);
      trip.assertJoinLink(token);
      const pending = viewer ? trip.pendingSeatOf(viewer) : undefined;
      return {
        tripId: trip.id,
        tripName: trip.name,
        organizer: trip.owner.displayName,
        seats: trip.allSeats
          .filter((s) => s.isActive && !s.isLinked)
          .map((s) => ({
            id: s.id,
            firstName: s.displayName.split(" ")[0],
            waiting: s.pendingClaim !== null && s.pendingClaim.principalId !== viewer,
          })),
        state: viewer && trip.seatOf(viewer) ? "member" : pending ? "pending" : "open",
        pendingSeatName: pending?.displayName ?? null,
      };
    });
  }

  /** Generic link: "Soy Leo" (seatId) or "No estoy en la lista" (newName). Waits for approval. */
  requestJoin(
    tripId: TripId,
    token: string,
    principal: Principal,
    choice: { seatId: SeatId } | { newName: string },
  ): Promise<Result<void>> {
    return attempt(async () => {
      const now = this.deps.clock.now();
      await this.change(tripId, (trip) => {
        if ("seatId" in choice) trip.requestClaimWithJoinLink(token, choice.seatId, principal, now);
        else trip.requestNewSeatWithJoinLink(token, choice.newName, principal, SeatId(this.deps.ids.next()), now);
      });
    });
  }

  rejectClaim(principalId: PrincipalId, tripId: TripId, seatId: SeatId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.rejectClaim(trip.actor(principalId).id, seatId));
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

  /** "¿Van a hacer vaca?" */
  createPot(principalId: PrincipalId, tripId: TripId, holderSeatId: SeatId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.createPot(trip.actor(principalId).id, holderSeatId, SeatId(this.deps.ids.next())));
    });
  }

  changePotHolder(principalId: PrincipalId, tripId: TripId, holderSeatId: SeatId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.changePotHolder(trip.actor(principalId).id, holderSeatId));
    });
  }

  removePot(principalId: PrincipalId, tripId: TripId): Promise<Result<void>> {
    return attempt(async () => {
      const current = await this.deps.trips.get(tripId);
      const potId = current?.pot?.id;
      const used = potId ? await this.deps.seatUsage.isSeatUsed(tripId, potId) : false;
      await this.change(tripId, (trip) => trip.removePot(trip.actor(principalId).id, used));
    });
  }

  /** Cerrado: needs 0 drafts, 0 pending payments and 0 pending approvals; then the trip is read-only. */
  closeTrip(principalId: PrincipalId, tripId: TripId): Promise<Result<void>> {
    return attempt(async () => {
      const pending = await this.deps.closeChecks.pending(tripId);
      await this.change(tripId, (trip) => trip.close(trip.actor(principalId).id, pending));
    });
  }

  /** Only the owner reopens a Cerrado trip, back to Liquidando with the same frozen plan. */
  reopenTrip(principalId: PrincipalId, tripId: TripId): Promise<Result<void>> {
    return attempt(async () => {
      await this.change(tripId, (trip) => trip.reopen(trip.actor(principalId).id));
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
