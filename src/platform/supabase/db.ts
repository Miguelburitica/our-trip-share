import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { conflict, DomainError, notFound, validationError } from "@/shared-kernel/errors";
import type { Database } from "./database.types";

/**
 * Shared Supabase plumbing for every context's infrastructure layer.
 * Repositories receive a service-role client: the server is the only writer (docs/ARCHITECTURE.md).
 */
export type Db = SupabaseClient<Database>;
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

/** Translates database errors that carry business meaning into DomainErrors; anything else is a bug. */
export function dbError(error: PostgrestError, what: string): Error {
  const text = `${error.message} ${error.details ?? ""}`;
  switch (error.code) {
    case "40001":
      return conflict("Alguien cambió esto mientras tanto");
    case "P0002":
      return notFound("No lo encontramos");
    case "23505":
      if (/seats_one_(principal|pending)_per_trip/.test(text)) {
        return new DomainError("already_claimed", "Ya tienes un lugar en este viaje");
      }
      if (/seats_name_per_trip/.test(text)) return validationError("Ya hay alguien con ese nombre");
      if (/split_groups_name_per_trip/.test(text)) return validationError("Ya hay un grupo con ese nombre");
      if (/seats_invite_token_hash_key/.test(text)) return conflict("Intenta de nuevo");
      break;
    case "23514":
      return validationError("Los montos no cuadran");
  }
  return new Error(`Supabase ${what} failed: ${error.code} ${error.message}`);
}

/** Unwraps a PostgREST response or throws the mapped error. Null only for `maybeSingle()` misses. */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T | null {
  if (res.error) throw dbError(res.error, what);
  return res.data;
}

/** Same, for queries that always return rows (lists, RPC results). */
export function unwrapAll<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  const data = unwrap(res, what);
  if (data === null) throw new Error(`Supabase ${what} returned no data`);
  return data;
}

export const toDate = (value: string) => new Date(value);
export const toDateOrNull = (value: string | null) => (value === null ? null : new Date(value));
