import { conflict, DomainError, forbidden, invalidState, notFound, validationError } from "@/shared-kernel/errors";
import type { PrincipalId, SeatId, TripId } from "@/shared-kernel/ids";
import { isCurrencyCode, type CurrencyCode } from "@/shared-kernel/money/currency";
import { Seat, type PrincipalKind, type Role, type SeatProps } from "./seat";

export type TripStatus = "active" | "settling" | "closed";
export type SettleMode = "simplified" | "hub" | "direct";

export interface Principal {
  readonly id: PrincipalId;
  readonly kind: PrincipalKind;
}

export interface TripProps {
  id: TripId;
  name: string;
  startDate: string | null; // ISO date (yyyy-mm-dd)
  endDate: string | null;
  baseCurrency: CurrencyCode;
  status: TripStatus;
  settleMode: SettleMode;
  hubSeatId: SeatId | null;
  seats: SeatProps[];
  createdAt: Date;
}

export interface CreateTripInput {
  id: TripId;
  name: string;
  baseCurrency: string;
  startDate?: string | null;
  endDate?: string | null;
  creator: Principal & { displayName: string };
  people?: readonly string[];
  newSeatId: () => SeatId;
  now: Date;
}

/** What a close attempt must know from the other contexts. */
export interface ClosePreconditions {
  drafts: number;
  pendingSettlements: number;
  pendingApprovals: number;
}

const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");
const nameKey = (name: string) => normalizeName(name).toLocaleLowerCase("es");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aggregate root of the trip-membership context. Owns its seats and every rule
 * about who is on the trip and who may change it.
 */
export class Trip {
  private seats: Seat[];

  private constructor(private props: Omit<TripProps, "seats">, seats: Seat[]) {
    this.seats = seats;
  }

  static create(input: CreateTripInput): Trip {
    const name = normalizeName(input.name);
    if (!name) throw validationError("El viaje necesita un nombre");
    if (name.length > 80) throw validationError("El nombre es demasiado largo");
    if (!isCurrencyCode(input.baseCurrency)) {
      throw validationError("Moneda no soportada", { currency: input.baseCurrency });
    }
    const startDate = input.startDate ?? null;
    const endDate = input.endDate ?? null;
    for (const d of [startDate, endDate]) {
      if (d !== null && !ISO_DATE.test(d)) throw validationError("Fecha inválida", { date: d });
    }
    if (startDate && endDate && endDate < startDate) {
      throw validationError("La fecha final es anterior a la inicial");
    }
    const creatorName = normalizeName(input.creator.displayName);
    if (!creatorName) throw validationError("Tu nombre es obligatorio");

    const ownerId = input.newSeatId();
    const seats: Seat[] = [
      new Seat({
        id: ownerId,
        displayName: creatorName,
        role: "owner",
        status: "active",
        link: { kind: input.creator.kind, principalId: input.creator.id },
        pendingClaim: null,
        defaultExcluded: false,
        inviteTokenHash: null,
        createdBy: null,
      }),
    ];
    const seen = new Set([nameKey(creatorName)]);
    for (const raw of input.people ?? []) {
      const display = normalizeName(raw);
      if (!display || seen.has(nameKey(display))) continue;
      seen.add(nameKey(display));
      seats.push(Trip.placeholder(input.newSeatId(), display, ownerId));
    }

    return new Trip(
      {
        id: input.id,
        name,
        startDate,
        endDate,
        baseCurrency: input.baseCurrency,
        status: "active",
        settleMode: "simplified",
        hubSeatId: null,
        createdAt: input.now,
      },
      seats,
    );
  }

  static fromPrimitives(props: TripProps): Trip {
    const { seats, ...rest } = props;
    return new Trip(rest, seats.map((s) => new Seat({ ...s })));
  }

  private static placeholder(id: SeatId, displayName: string, createdBy: SeatId | null): Seat {
    return new Seat({
      id,
      displayName,
      role: "member",
      status: "active",
      link: { kind: "none" },
      pendingClaim: null,
      defaultExcluded: false,
      inviteTokenHash: null,
      createdBy,
    });
  }

  // ---------- queries ----------

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get status() {
    return this.props.status;
  }
  get baseCurrency() {
    return this.props.baseCurrency;
  }
  get settleMode() {
    return this.props.settleMode;
  }
  get hubSeatId() {
    return this.props.hubSeatId;
  }
  get startDate() {
    return this.props.startDate;
  }
  get endDate() {
    return this.props.endDate;
  }
  get allSeats(): readonly Seat[] {
    return this.seats;
  }
  get owner(): Seat {
    const owner = this.seats.find((s) => s.role === "owner");
    if (!owner) throw invalidState("Trip without owner");
    return owner;
  }

  seat(seatId: SeatId): Seat {
    const seat = this.seats.find((s) => s.id === seatId);
    if (!seat) throw notFound("Esa persona no está en el viaje", { seatId });
    return seat;
  }

  /** The seat a principal is linked to (pending claims don't count). */
  seatOf(principalId: PrincipalId): Seat | undefined {
    return this.seats.find((s) => s.principalId === principalId);
  }

  /** Resolves and authorizes the acting member: linked and not pending. */
  actor(principalId: PrincipalId): Seat {
    const seat = this.seatOf(principalId);
    if (!seat) throw forbidden("No eres parte de este viaje");
    return seat;
  }

  /** Seats a new expense includes by default. */
  defaultParticipantIds(): SeatId[] {
    return this.seats.filter((s) => s.isActive && !s.defaultExcluded).map((s) => s.id);
  }

  // ---------- seats ----------

  addSeat(actorId: SeatId, displayName: string, newSeatId: SeatId): Seat {
    this.requireActiveMember(actorId);
    const name = normalizeName(displayName);
    if (!name) throw validationError("El nombre es obligatorio");
    if (this.seats.some((s) => nameKey(s.displayName) === nameKey(name))) {
      throw conflict("Ya hay alguien con ese nombre", { name });
    }
    const seat = Trip.placeholder(newSeatId, name, actorId);
    this.seats.push(seat);
    return seat;
  }

  renameSeat(actorId: SeatId, seatId: SeatId, displayName: string) {
    this.requireActiveMember(actorId);
    const name = normalizeName(displayName);
    if (!name) throw validationError("El nombre es obligatorio");
    if (this.seats.some((s) => s.id !== seatId && nameKey(s.displayName) === nameKey(name))) {
      throw conflict("Ya hay alguien con ese nombre", { name });
    }
    this.seat(seatId)._update({ displayName: name });
  }

  /** Issues (or re-issues) a personal invite. Re-issuing revokes the previous link. */
  issueInvite(actorId: SeatId, seatId: SeatId, tokenHash: string) {
    this.requireAdmin(actorId);
    const seat = this.seat(seatId);
    if (seat.role === "owner") throw forbidden("No puedes reinvitar al organizador");
    seat._update({ inviteTokenHash: tokenHash, link: { kind: "none" }, pendingClaim: null });
  }

  /** The seat a personal link points to. Re-issuing a link invalidates the old one. */
  seatForInvite(tokenHash: string): Seat {
    const seat = this.seats.find((s) => s.inviteTokenHash !== null && s.inviteTokenHash === tokenHash);
    if (!seat) throw forbidden("Este enlace ya no es válido");
    return seat;
  }

  /** Personal link: links the opener immediately. */
  claimWithInvite(tokenHash: string, principal: Principal): Seat {
    const seat = this.seatForInvite(tokenHash);
    if (seat.principalId === principal.id) return seat;
    if (seat.isLinked) throw new DomainError("already_claimed", "Este lugar ya fue reclamado");
    this.ensurePrincipalFree(principal.id, seat.id);
    seat._update({ link: { kind: principal.kind, principalId: principal.id }, pendingClaim: null });
    return seat;
  }

  /**
   * A guest saved their access (linked an email): same principal, now an account.
   * Returns false when nothing changed, so callers can skip the write.
   */
  upgradeGuest(principalId: PrincipalId): boolean {
    const seat = this.seatOf(principalId);
    if (!seat || seat.link.kind !== "guest") return false;
    seat._update({ link: { kind: "user", principalId } });
    return true;
  }

  /** Generic link: creates a pending claim that sees nothing until approved. */
  requestClaim(seatId: SeatId, principal: Principal, now: Date) {
    const seat = this.seat(seatId);
    if (seat.isLinked) throw new DomainError("already_claimed", "Este lugar ya fue reclamado");
    if (seat.pendingClaim && seat.pendingClaim.principalId !== principal.id) {
      throw new DomainError("already_claimed", "Alguien más está pidiendo este lugar");
    }
    this.ensurePrincipalFree(principal.id, seat.id);
    seat._update({ pendingClaim: { principalId: principal.id, principalKind: principal.kind, requestedAt: now } });
  }

  /** "No estoy en la lista": a new seat with a pending claim. */
  requestNewSeat(displayName: string, principal: Principal, newSeatId: SeatId, now: Date): Seat {
    const name = normalizeName(displayName);
    if (!name) throw validationError("El nombre es obligatorio");
    this.ensurePrincipalFree(principal.id, null);
    const seat = Trip.placeholder(newSeatId, name, null);
    seat._update({ pendingClaim: { principalId: principal.id, principalKind: principal.kind, requestedAt: now } });
    this.seats.push(seat);
    return seat;
  }

  approveClaim(actorId: SeatId, seatId: SeatId) {
    const actor = this.requireActiveMember(actorId);
    const seat = this.seat(seatId);
    if (!actor.isAdmin && seat.createdBy !== actor.id) {
      throw forbidden("Solo el organizador, un admin o quien agregó a esta persona puede aprobar");
    }
    const claim = seat.pendingClaim;
    if (!claim) throw invalidState("No hay una solicitud pendiente");
    if (seat.isLinked) throw new DomainError("already_claimed", "Este lugar ya fue reclamado");
    this.ensurePrincipalFree(claim.principalId, seat.id);
    seat._update({ link: { kind: claim.principalKind, principalId: claim.principalId }, pendingClaim: null });
  }

  rejectClaim(actorId: SeatId, seatId: SeatId) {
    const actor = this.requireActiveMember(actorId);
    const seat = this.seat(seatId);
    if (!actor.isAdmin && seat.createdBy !== actor.id) throw forbidden("No puedes rechazar esta solicitud");
    seat._update({ pendingClaim: null });
  }

  /** Undo a claim: records stay on the seat, the principal loses access. */
  unlinkSeat(actorId: SeatId, seatId: SeatId) {
    this.requireAdmin(actorId);
    const seat = this.seat(seatId);
    if (seat.role === "owner") throw forbidden("No puedes desvincular al organizador");
    seat._update({ link: { kind: "none" }, pendingClaim: null });
  }

  setRole(actorId: SeatId, seatId: SeatId, role: Exclude<Role, "owner">) {
    const actor = this.requireActiveMember(actorId);
    if (actor.role !== "owner") throw forbidden("Solo el organizador cambia roles");
    const seat = this.seat(seatId);
    if (seat.role === "owner") throw forbidden("Para cambiar al organizador transfiere la propiedad");
    seat._update({ role });
  }

  transferOwnership(actorId: SeatId, toSeatId: SeatId) {
    const actor = this.requireActiveMember(actorId);
    if (actor.role !== "owner") throw forbidden("Solo el organizador puede transferir el viaje");
    const target = this.seat(toSeatId);
    if (!target.isActive || !target.isLinked) {
      throw validationError("El nuevo organizador debe estar activo y haber entrado al viaje");
    }
    actor._update({ role: "admin" });
    target._update({ role: "owner" });
  }

  markLeft(actorId: SeatId, seatId: SeatId) {
    const actor = this.requireActiveMember(actorId);
    const seat = this.seat(seatId);
    if (actor.id !== seat.id && !actor.isAdmin) throw forbidden("No puedes marcar a otra persona");
    if (seat.role === "owner") throw forbidden("Transfiere el viaje antes de salir");
    seat._update({ status: "left" });
  }

  /** Removal only for seats that no expense or settlement references (checked by the caller). */
  removeSeat(actorId: SeatId, seatId: SeatId, isUsed: boolean) {
    this.requireAdmin(actorId);
    const seat = this.seat(seatId);
    if (seat.role === "owner") throw forbidden("No puedes quitar al organizador");
    if (isUsed) throw invalidState("Esta persona ya tiene gastos; márcala como 'se fue'");
    this.seats = this.seats.filter((s) => s.id !== seatId);
    if (this.props.hubSeatId === seatId) this.props.hubSeatId = null;
  }

  setDefaultExcluded(actorId: SeatId, seatId: SeatId, excluded: boolean) {
    this.requireActiveMember(actorId);
    this.seat(seatId)._update({ defaultExcluded: excluded });
  }

  // ---------- trip settings & lifecycle ----------

  startSettling(actorId: SeatId) {
    this.requireAdmin(actorId);
    if (this.props.status !== "active") throw invalidState("El viaje no está activo");
    this.props.status = "settling";
  }

  close(actorId: SeatId, pending: ClosePreconditions) {
    this.requireAdmin(actorId);
    if (this.props.status !== "settling") throw invalidState("Primero hay que empezar a liquidar");
    const blocking = Object.entries(pending).filter(([, count]) => count > 0);
    if (blocking.length > 0) {
      throw invalidState("Aún hay pendientes", Object.fromEntries(blocking));
    }
    this.props.status = "closed";
  }

  reopen(actorId: SeatId) {
    const actor = this.requireActiveMember(actorId);
    if (actor.role !== "owner") throw forbidden("Solo el organizador puede reabrir");
    if (this.props.status !== "closed") throw invalidState("El viaje no está cerrado");
    this.props.status = "settling";
  }

  rename(actorId: SeatId, name: string) {
    this.requireAdmin(actorId);
    const n = normalizeName(name);
    if (!n) throw validationError("El viaje necesita un nombre");
    this.props.name = n;
  }

  changeBaseCurrency(actorId: SeatId, code: string, hasSettlements: boolean) {
    this.requireAdmin(actorId);
    if (!isCurrencyCode(code)) throw validationError("Moneda no soportada", { currency: code });
    if (hasSettlements) {
      throw new DomainError("currency_locked", "La moneda se bloquea después del primer pago");
    }
    this.props.baseCurrency = code;
  }

  changeSettleMode(actorId: SeatId, mode: SettleMode, hubSeatId: SeatId | null, hasSettlements: boolean) {
    const actor = this.requireAdmin(actorId);
    if (hasSettlements && actor.role !== "owner") {
      throw forbidden("Después del primer pago solo el organizador cambia el modo");
    }
    if (mode === "hub") {
      if (!hubSeatId) throw validationError("Elige quién recibe los pagos");
      const hub = this.seat(hubSeatId);
      if (!hub.isActive) throw validationError("Quien recibe los pagos debe estar activo");
    }
    this.props.settleMode = mode;
    this.props.hubSeatId = mode === "hub" ? hubSeatId : null;
  }

  // ---------- helpers ----------

  private requireActiveMember(seatId: SeatId): Seat {
    const seat = this.seat(seatId);
    if (!seat.isLinked) throw forbidden("Esta persona aún no ha entrado al viaje");
    return seat;
  }

  private requireAdmin(seatId: SeatId): Seat {
    const seat = this.requireActiveMember(seatId);
    if (!seat.isAdmin) throw forbidden("Solo el organizador o un admin puede hacer esto");
    return seat;
  }

  private ensurePrincipalFree(principalId: PrincipalId, exceptSeat: SeatId | null) {
    const other = this.seats.find(
      (s) =>
        s.id !== exceptSeat &&
        (s.principalId === principalId || s.pendingClaim?.principalId === principalId),
    );
    if (other) throw conflict("Ya tienes un lugar en este viaje", { seatId: other.id });
  }

  toPrimitives(): TripProps {
    return { ...this.props, seats: this.seats.map((s) => s.toPrimitives()) };
  }
}
