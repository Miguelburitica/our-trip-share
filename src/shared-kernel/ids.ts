declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TripId = Brand<string, "TripId">;
export type SeatId = Brand<string, "SeatId">;
export type PrincipalId = Brand<string, "PrincipalId">;
export type ExpenseId = Brand<string, "ExpenseId">;
export type SettlementId = Brand<string, "SettlementId">;

export const TripId = (value: string) => value as TripId;
export const SeatId = (value: string) => value as SeatId;
export const PrincipalId = (value: string) => value as PrincipalId;
export const ExpenseId = (value: string) => value as ExpenseId;
export const SettlementId = (value: string) => value as SettlementId;

/** Port: produces unique identifiers. */
export interface IdGenerator {
  next(): string;
}

export const uuidGenerator: IdGenerator = { next: () => crypto.randomUUID() };

/** Deterministic ids for tests and seeds: "seat-1", "seat-2"… */
export function sequentialIds(prefix = "id"): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
