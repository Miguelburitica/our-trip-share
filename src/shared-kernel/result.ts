import { DomainError } from "./errors";

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/**
 * Runs domain code that may throw a DomainError and converts it into a Result.
 * Unexpected errors are re-thrown: they are bugs, not business outcomes.
 */
export async function attempt<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof DomainError) return err(e);
    throw e;
  }
}
