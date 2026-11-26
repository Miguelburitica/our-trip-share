import { forbidden, invalidState, validationError } from "@/shared-kernel/errors";
import type { SeatId, SplitGroupId, TripId } from "@/shared-kernel/ids";
import type { Context } from "./expense";
import { isAdminSeat, isTripSeat } from "./trip-view";

export const MAX_GROUPS_PER_TRIP = 12;
export const MAX_GROUP_NAME = 30;

export interface SplitGroupProps {
  id: SplitGroupId;
  tripId: TripId;
  name: string;
  seatIds: SeatId[];
  createdBy: SeatId;
  createdAt: Date;
}

const key = (name: string) => name.trim().toLocaleLowerCase("es");

/**
 * A saved subgroup for splitting ("Carro 1", "Parejas"), shared by the whole trip so whoever
 * records the expense can pick it. It only stores who is in it; the split itself stays equal.
 */
export class SplitGroup {
  private constructor(private readonly props: SplitGroupProps) {}

  static create(
    input: { id: SplitGroupId; name: string; seatIds: ReadonlyArray<SeatId> },
    ctx: Context,
    existing: ReadonlyArray<SplitGroup>,
  ): SplitGroup {
    if (ctx.trip.status === "closed") throw invalidState("El viaje está cerrado");
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > MAX_GROUP_NAME) throw validationError(`Ponle un nombre de hasta ${MAX_GROUP_NAME} letras`);
    if (existing.some((g) => key(g.name) === key(name))) throw validationError("Ya hay un grupo con ese nombre");
    if (existing.length >= MAX_GROUPS_PER_TRIP) throw validationError(`Máximo ${MAX_GROUPS_PER_TRIP} grupos por viaje`);
    const seatIds = [...new Set(input.seatIds)];
    if (seatIds.some((id) => !isTripSeat(ctx.trip, id))) throw validationError("Hay alguien que no es de este viaje");
    if (seatIds.length < 2) throw validationError("Un grupo necesita al menos 2 personas");
    return new SplitGroup({ id: input.id, tripId: ctx.trip.tripId, name, seatIds, createdBy: ctx.actor, createdAt: ctx.now });
  }

  static fromPrimitives(props: SplitGroupProps): SplitGroup {
    return new SplitGroup({ ...props, seatIds: [...props.seatIds] });
  }

  /** Its creator or a trip admin may delete it. */
  assertCanDelete(ctx: Context): void {
    if (this.props.createdBy !== ctx.actor && !isAdminSeat(ctx.trip, ctx.actor)) {
      throw forbidden("Solo quien creó el grupo o un admin puede borrarlo");
    }
  }

  /** Members who are still active in the trip; a group with fewer than 2 left is hidden. */
  activeSeats(ctx: Pick<Context, "trip">): SeatId[] {
    const active = new Set(ctx.trip.seats.filter((s) => s.active).map((s) => s.id));
    return this.props.seatIds.filter((id) => active.has(id));
  }

  get id() {
    return this.props.id;
  }
  get tripId() {
    return this.props.tripId;
  }
  get name() {
    return this.props.name;
  }

  toPrimitives(): SplitGroupProps {
    return { ...this.props, seatIds: [...this.props.seatIds] };
  }
}
